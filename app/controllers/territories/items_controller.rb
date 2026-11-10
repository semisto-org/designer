# The dossier of a territory: people met, sources, expectations, dated
# markers and layout leads (TerritoryItem). People add and change them here;
# an AI only proposes drafts (MCP propose_territory_items), accepted or
# rejected one by one here.
module Territories
  class ItemsController < ApplicationController
    include TerritoryScoped
    include ActiveStorage::SetCurrent

    LINK_LIFETIME = 5.minutes

    before_action :set_territory
    before_action :require_territory_editor!, except: :file
    before_action :set_item, except: :create

    def create
      item = @territory.items.new(kind: params[:kind], status: "active", source: "human", created_by: Current.user)
      assign(item)
      save(item, "territories.flash.item_created")
    end

    def update
      item = @item
      item.lock_version = params[:lock_version] if params[:lock_version].present?
      assign(item)
      save(item, "territories.flash.item_saved")
    rescue ActiveRecord::StaleObjectError
      back alert: t("territories.errors.stale")
    end

    def destroy
      @item.destroy!
      back notice: t("territories.flash.item_deleted")
    end

    # The copy of a source's file, for the team only.
    def file
      return head(:not_found) unless @item.file.attached?
      redirect_to stored_file_url(@item.file, expires_in: LINK_LIFETIME, disposition: :attachment), allow_other_host: true
    end

    def accept
      return back(alert: t("territories.errors.not_a_draft")) unless @item.draft?
      @item.accept!(Current.user)
      back notice: t("territories.flash.accepted")
    end

    def reject
      return back(alert: t("territories.errors.not_a_draft")) unless @item.draft?
      @item.reject!(Current.user)
      back notice: t("territories.flash.rejected")
    end

    private
      def set_item
        @item = @territory.items.find(params[:id])
      end

      def assign(item)
        item.title = params[:title] if params.key?(:title)
        item.body = params[:body] if params.key?(:body)
        item.geometry = params[:geometry].presence if params.key?(:geometry)
        if params.key?(:properties)
          given = params[:properties]
          given = JSON.parse(given) if given.is_a?(String)
          given = given.to_unsafe_h if given.respond_to?(:to_unsafe_h)
          item.properties = item.properties.merge(given.is_a?(Hash) ? given.stringify_keys : {})
        end
        item.file.attach(params[:file]) if params[:file].present? && item.kind == "source"
        item.file.purge_later if params[:remove_file].present? && item.file.attached?
      rescue JSON::ParserError, RGeo::Error::ParseError
        item.errors.add(:base, :invalid)
      end

      def save(item, notice_key)
        if item.errors.none? && item.save
          back notice: t(notice_key)
        else
          back alert: item.errors.full_messages.to_sentence.presence || t("territories.errors.invalid")
        end
      end

      def back(**flash)
        redirect_to territory_path(@territory, tab: params[:tab].presence), status: :see_other, **flash
      end
  end
end
