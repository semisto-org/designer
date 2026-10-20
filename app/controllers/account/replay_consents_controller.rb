# PATCH /account/replay_consent — the answer to « Nous laisses-tu filmer tes
# premières séances ? » (FirstHourHost, and « Mon compte » to change it).
module Account
  class ReplayConsentsController < ApplicationController
    forbid_while_impersonating

    def update
      consent = { "true" => true, "false" => false }[params[:consent].to_s]
      return render(json: { message: t("first_hour.consent.invalid") }, status: :unprocessable_entity) if consent.nil?
      Current.user.answer_replay_consent!(consent)
      render json: { state: Current.user.session_replay_state }
    end
  end
end
