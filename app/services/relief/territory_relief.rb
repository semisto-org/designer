module Relief
  # A territory's relief (terrain model only, coarse grid, or a fine window
  # around a point), imported the
  # first time an AI asks for a catchment there. Nobody watches a progress
  # bar: `ensure!` starts the import when there is none (or a dead one),
  # leaves a running or retrying one alone, and starts a failed one again
  # only when asked (`force: true`) or once RELAUNCH_AFTER has passed, so a
  # call never restarts an import from zero while it is progressing.
  class TerritoryRelief
    RELAUNCH_AFTER = 6.hours

    attr_reader :terrain

    # `window`: a fine window (Relief::DetailWindow) instead of the coarse
    # relief of the whole commune.
    def initialize(territory, window: nil)
      @territory = territory
      @window = window
      @terrain = window ? territory.detail_terrains.find_by(detail_key: window.key) : territory.terrain
    end

    def ready? = terrain&.ready? && terrain.grid.attached?

    # Returns the terrain, launched when it needs to be.
    def ensure!(force: false)
      return terrain if ready?
      launch! if launch?(force)
      terrain
    end

    def state = terrain&.state || { status: "none" }

    private
      def launch?(force)
        return true if terrain.nil?
        return false if terrain.in_progress? || terrain.retry_scheduled?
        return true unless terrain.failed? # pending or running, but dead
        # Failed before failures said whether a retry helps: the old import
        # gave up on cells beyond the region, so start it again at once.
        return true unless terrain.metadata.key?("retriable")

        force || (terrain.retriable? && terrain.updated_at < RELAUNCH_AFTER.ago)
      end

      def launch!
        @terrain ||= @window ? @territory.detail_terrains.build(detail_key: @window.key) : @territory.build_terrain
        terrain.update!(status: "pending", progress: 0, error: nil, attempts: 0, retry_at: nil, queued_at: Time.current)
        ReliefImportJob.perform_later(terrain)
      end
  end
end
