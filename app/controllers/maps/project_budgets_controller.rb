# « Budget du projet »: the team sets an item's budget by hand when the
# accepted offer does not give it (an offer made elsewhere, a change agreed
# with the client), or clears it to read the offer again.
module Maps
  class ProjectBudgetsController < ApplicationController
    include MapScoped
    include ProjectInvoiceParams

    before_action :set_map

    def update
      return render(json: { message: t("time_entries.errors.no_access") }, status: :forbidden) unless ProjectInvoice.writable_by?(@map, Current.user)
      overrides = @map.budget_overrides.to_h.dup
      ProjectInvoice::ITEMS.each do |item|
        next unless params[:items]&.key?(item)
        value = params[:items][item].to_s
        if value.strip.empty?
          overrides.delete(item)
        elsif (amount = cents(value))
          overrides[item] = amount
        else
          return render(json: { message: t("time_entries.budget.errors.amount"), errors: { item => [ t("time_entries.budget.errors.amount") ] } }, status: :unprocessable_content)
        end
      end
      @map.update!(budget_overrides: overrides)
      render json: { budget: ProjectBudget.new(@map).as_json }
    end
  end
end
