# A change, or a removal, an AI proposed to an entry a person already kept
# (MCP propose_territory_updates, propose_territory_deletions). A person
# accepts it whole or field by field (`fields`), or rejects it.
module Territories
  class ItemUpdatesController < ApplicationController
    include TerritoryScoped

    before_action :set_territory
    before_action :require_territory_editor!
    before_action :set_update

    def accept
      fields = Array(params[:fields]).map(&:to_s).presence unless @update.deletion?
      TerritoryItemUpdate.transaction { @update.accept!(Current.user, fields:) }
      back notice: t(@update.deletion? ? "territories.flash.update_deleted" : "territories.flash.update_accepted")
    rescue ArgumentError
      back alert: t("territories.errors.no_field_chosen")
    rescue ActiveRecord::RecordInvalid => e
      back alert: e.record.errors.full_messages.to_sentence.presence || t("territories.errors.invalid")
    rescue ActiveRecord::StaleObjectError
      back alert: t("territories.errors.stale")
    end

    def reject
      @update.reject!(Current.user)
      back notice: t("territories.flash.update_rejected")
    end

    private
      def set_update
        @update = @territory.item_updates.pending.find_by(id: params[:id])
        back(alert: t("territories.errors.not_a_draft")) unless @update
      end

      def back(**flash)
        redirect_to territory_path(@territory, tab: params[:tab].presence), status: :see_other, **flash
      end
  end
end
