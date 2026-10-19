# Super admin « Pilotes de drone »: the applications to check (operator
# number, certificates, insurance, legal details for the yearly DAC7
# report), the listed pilots to suspend, and the missions to settle: a
# dispute, a payout that failed, a refund.
module Admin
  class DronePilotsController < BaseController
    def index
      pilots = DronePilot.includes(:user, :reviewed_by).order(Arel.sql("CASE status WHEN 'pending' THEN 0 ELSE 1 END"), created_at: :desc)
      missions = DroneMission.includes(:map, :client, drone_pilot: :user).newest_first.limit(200)
      render inertia: "admin/drone_pilots/index", props: {
        pilots: pilots.map { pilot_json(_1) },
        missions: missions.map { mission_json(_1) }
      }
    end

    def update
      pilot = DronePilot.find(params[:id])
      note = params.dig(:drone_pilot, :note)
      case params.dig(:drone_pilot, :decision)
      when "approve" then pilot.approve!(by: Current.user)
      when "reject" then pilot.reject!(by: Current.user, note:)
      when "suspend" then pilot.suspend!(by: Current.user, note:)
      else return redirect_to(admin_drone_pilots_path, alert: t("drone_pilots.admin.decision_missing"))
      end
      AdminEvent.record!("drone_pilot_#{pilot.status}", admin: Current.user, request:, drone_pilot_id: pilot.id)
      redirect_to admin_drone_pilots_path, notice: t("drone_pilots.admin.done.#{pilot.status}", name: pilot.display_name), status: :see_other
    rescue ActiveRecord::RecordInvalid => e
      redirect_to admin_drone_pilots_path, alert: e.record.errors.full_messages.to_sentence
    end

    # Settles a mission: pays the pilot their share, or refunds the client.
    def mission
      mission = DroneMission.find(params[:id])
      case params[:decision]
      when "payout" then DroneMissions::Payout.call(mission)
      when "refund" then DroneMissions::Refund.call(mission)
      else return redirect_to(admin_drone_pilots_path, alert: t("drone_pilots.admin.decision_missing"))
      end
      AdminEvent.record!("drone_mission_#{params[:decision]}", admin: Current.user, request:, drone_mission_id: mission.id)
      mission.reload
      if params[:decision] == "payout" && mission.payout_error.present?
        redirect_to admin_drone_pilots_path, alert: t("drone_pilots.admin.mission_done.payout_failed", id: mission.id, error: mission.payout_error), status: :see_other
      else
        redirect_to admin_drone_pilots_path, notice: t("drone_pilots.admin.mission_done.#{params[:decision]}", id: mission.id), status: :see_other
      end
    rescue DroneMission::InvalidTransition
      redirect_to admin_drone_pilots_path, alert: t("drone_missions.errors.state")
    rescue Providers::StripeGateway::Error => e
      Rails.error.report(e, handled: true)
      redirect_to admin_drone_pilots_path, alert: e.message
    end

    private
      def pilot_json(pilot)
        DronePilots::Directory.card(pilot).merge(
          status: pilot.status, email: pilot.user.email_address, phone: pilot.phone, operatorNumber: pilot.operator_number, insurer: pilot.insurer,
          legalForm: pilot.legal_form, legalName: pilot.legal_name, businessNumber: pilot.business_number, vatNumber: pilot.vat_number,
          taxNumber: pilot.tax_number, address: pilot.address, country: pilot.country, birthDate: pilot.birth_date&.iso8601,
          payoutsEnabled: pilot.payouts_enabled, stripeAccountId: pilot.stripe_account_id, reviewNote: pilot.review_note,
          reviewedBy: pilot.reviewed_by&.display_name, reviewedAt: pilot.reviewed_at&.iso8601, createdAt: pilot.created_at.iso8601
        )
      end

      def mission_json(mission)
        { id: mission.id, status: mission.status, mapId: mission.map_id, mapName: mission.map.name, pilotName: mission.drone_pilot.display_name,
          clientName: mission.client.display_name, totalCents: mission.total_cents, commissionCents: mission.commission_cents,
          pilotShareCents: mission.pilot_share_cents, paidAt: mission.paid_at&.iso8601, deliveredAt: mission.delivered_at&.iso8601,
          paidOutAt: mission.paid_out_at&.iso8601, disputed: mission.disputed?, disputeMessage: mission.dispute_message,
          payoutError: mission.payout_error, livemode: mission.livemode }
      end
  end
end
