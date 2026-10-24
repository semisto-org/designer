# « Premières heures » (/admin/first-hours): for each person who signed up
# in the period, the first moments of their place (first map, outline, first
# plant, plan printed), counted in minutes from the sign-up, with their
# feedback and the Sentry replays of their first sessions. A few grouped
# queries for the whole page.
module Admin
  class FirstHours
    LIMIT = 200
    MILESTONES = %i[map outline plant print].freeze
    FIRST_HOUR = 60

    def self.call(since:) = new(since).as_json

    def initialize(since)
      @since = since
      @users = User.where(created_at: since..).order(created_at: :desc, id: :desc).limit(LIMIT).to_a
      @ids = @users.map(&:id)
    end

    def as_json(*)
      people = @users.map { |user| person(user) }
      { since: @since.iso8601, people:, summary: summary(people) }
    end

    private
      def person(user)
        map = first_maps[user.id]
        reached = { map: map&.created_at, outline: outlined[user.id], plant: first_plants[user.id], print: printed[user.id] }
        { id: user.id, name: user.display_name, email: user.email_address, signedUpAt: user.created_at.iso8601,
          lastSignedInAt: user.last_signed_in_at&.iso8601, replayConsent: user.replay_consent,
          map: map && { id: map.id, name: map.name },
          milestones: MILESTONES.index_with { |key| milestone(user, key, reached[key]) },
          feedbacks: feedback_counts[user.id] || 0,
          replays: (replays[user.id] || []).map { |replay| { id: replay.replay_id, url: replay.url, createdAt: replay.created_at.iso8601 } } }
      end

      # nil: not yet. `at` nil: done, but before the moment was dated (an
      # outline drawn before 21 October 2026).
      def milestone(user, key, at)
        return { at: nil, minutes: nil } if at.nil? && key == :outline && bounded.include?(user.id)
        return nil unless at
        { at: at.iso8601, minutes: [ ((at - user.created_at) / 60).round, 0 ].max }
      end

      def summary(people)
        { people: people.size,
          consented: people.count { |p| p[:replayConsent] },
          replays: people.sum { |p| p[:replays].size },
          feedbacks: people.sum { |p| p[:feedbacks] },
          milestones: MILESTONES.index_with do |key|
            done = people.filter_map { |p| p[:milestones][key] }
            { reached: done.size, firstHour: done.count { |m| m[:minutes] && m[:minutes] <= FIRST_HOUR } }
          end }
      end

      def owned = Map.where(owner_id: @ids)

      def first_maps
        @first_maps ||= owned.select("DISTINCT ON (maps.owner_id) maps.id, maps.owner_id, maps.name, maps.created_at")
          .order("maps.owner_id", "maps.created_at", "maps.id").index_by(&:owner_id)
      end

      def outlined = @outlined ||= owned.group(:owner_id).minimum(:outlined_at)
      def bounded = @bounded ||= owned.where.not(boundary: nil).distinct.pluck(:owner_id).to_set
      def printed = @printed ||= owned.group(:owner_id).minimum(:plan_printed_at)

      def first_plants
        @first_plants ||= MapFeature.joins(:map).where(maps: { owner_id: @ids }, layer: "plants", status: "active")
          .group("maps.owner_id").minimum(:created_at)
      end

      def feedback_counts = @feedback_counts ||= Feedback.where(user_id: @ids).group(:user_id).count
      def replays = @replays ||= SessionReplay.where(user_id: @ids).oldest_first.group_by(&:user_id)
  end
end
