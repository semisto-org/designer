# « Site hors ligne » in the editor's « Exporter » menu: the map packed as a
# website that opens without Terranova (MapOfflineSite, OfflineSiteJob).
#
#   GET  /maps/:map_id/offline_site           its status (JSON)
#   POST /maps/:map_id/offline_site           builds it again (networks=1: with the
#                                             sensitive networks, owners and editors only)
#   GET  /maps/:map_id/offline_site/download  the zip
#
# Every role may take it, on an archived or read-only map too: nothing is
# taken hostage.
module Maps
  class OfflineSitesController < ApplicationController
    include MapScoped
    include ActiveStorage::SetCurrent

    before_action :set_map

    def show
      render json: status_json
    end

    def create
      networks = params[:networks].to_s == "1" && editor?
      MapOfflineSite.request!(@map, by: Current.user, include_networks: networks)
      render json: status_json, status: :accepted
    end

    def download
      site = @map.offline_site
      return head :not_found unless site&.ready?
      # A site with the networks stays with owners and editors.
      return head :forbidden if site.include_networks && !editor?
      redirect_to stored_file_url(site.archive, expires_in: 10.minutes, disposition: :attachment), allow_other_host: true
    end

    private
      def status_json
        site = @map.reload.offline_site
        json = site&.as_inertia || { status: "none" }
        json = { status: "none" } if site&.include_networks && !editor?
        json.merge(canIncludeNetworks: editor?)
      end

      def editor? = %w[owner editor].include?(@role)
  end
end
