# The sections of a column of the team board (BoardSection): any member of
# the team adds one to a column, renames it, moves it up or down (`shift`:
# -1 or 1) and deletes it, which leaves its projects loose in the column.
# Answers with the column's sections in order.
module Teams
  class BoardSectionsController < ApplicationController
    include TeamScoped

    before_action :set_team
    before_action :set_section, only: %i[update destroy]

    def create
      section = @team.board_sections.create!(params.require(:section).permit(:phase, :name))
      render json: { sections: column(section.phase), section: section.as_board_json }, status: :created
    rescue ActiveRecord::RecordInvalid => e
      render json: { message: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    def update
      attrs = params.require(:section).permit(:name, :shift)
      @section.update!(name: attrs[:name]) if attrs.key?(:name)
      @section.shift!(attrs[:shift]) if attrs[:shift].present?
      render json: { sections: column(@section.phase), section: @section.as_board_json }
    rescue ActiveRecord::RecordInvalid => e
      render json: { message: e.record.errors.full_messages.to_sentence }, status: :unprocessable_entity
    end

    def destroy
      @section.destroy!
      render json: { sections: column(@section.phase) }
    end

    private
      def set_section
        @section = @team.board_sections.find(params[:id])
      end

      def column(phase) = @team.board_sections.where(phase:).ordered.map(&:as_board_json)
  end
end
