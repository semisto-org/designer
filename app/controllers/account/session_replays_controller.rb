# POST /account/session_replays — the browser says which Sentry replay is
# recording (lib/replay.ts). A replay already known is fine; a new one is
# kept while the person has sessions left (SessionReplayConsent), and
# `recorded: false` tells the browser to stop it.
module Account
  class SessionReplaysController < ApplicationController
    forbid_while_impersonating

    def create
      replay_id = params.require(:replay_id).to_s
      recorded = Current.user.session_replays.exists?(replay_id:) || start(replay_id)
      render json: { recorded:, state: Current.user.session_replay_state }
    end

    private
      def start(replay_id)
        return false unless Current.user.session_replay_state == "record"
        Current.user.session_replays.create(replay_id:, path: params[:path].to_s.first(500).presence).persisted?
      end
  end
end
