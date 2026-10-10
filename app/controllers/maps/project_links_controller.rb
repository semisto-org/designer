module Maps
  # The project sheet's private link (editors): switch it on (creating it the
  # first time), reset it (new address) or switch it off.
  class ProjectLinksController < ApplicationController
    include MapScoped

    before_action :set_map
    before_action :require_editor!

    def create
      link = @map.project_sheet_link || @map.build_project_sheet_link(created_by: Current.user)
      link.disabled_at = nil
      link.save!
      render_link(link, :created)
    end

    def reset
      link = @map.project_sheet_link or return head :not_found
      link.reset!
      render_link(link)
    end

    def destroy
      link = @map.project_sheet_link or return head :not_found
      link.disable!
      render_link(link)
    end

    private
      def render_link(link, status = :ok)
        render json: { formLink: link.as_json_for_editor(project_form_url(link.token)) }, status:
      end
  end
end
