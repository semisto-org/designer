module Transfers
  # Props of the recipient's screen (/maps/:map_id/transfers/:id): the
  # proposal, what changes, and the plan impact computed for the recipient
  # (MapTransfer::PlanImpact) while it can still be answered. A recipient who
  # lost access to the map meanwhile only sees what became of the proposal.
  class PagePayload
    def initialize(transfer, user)
      @transfer = transfer
      @map = transfer.map
      @user = user
    end

    def as_json(*)
      pending = @transfer.pending?
      problem = pending ? @transfer.problem : nil
      {
        transfer: {
          id: @transfer.id,
          state: @transfer.state,
          fromName: @transfer.from_user.display_name,
          createdAt: @transfer.created_at.iso8601,
          expiresAt: @transfer.expires_at.iso8601,
          closedAt: @transfer.closed_at&.iso8601,
          problem: problem && @transfer.message_for(problem)
        },
        map: map_props,
        impact: (MapTransfer::PlanImpact.new(@map, @user).as_json if pending && problem.nil?)
      }
    end

    private
      def map_props
        props = { id: @map.id, name: @map.name, canOpen: @map.viewable_by?(@user) }
        return props unless props[:canOpen]

        props.merge(address: @map.address, areaM2: @map.area_m2, regionName: @map.region.name, team: @map.organization&.name)
      end
  end
end
