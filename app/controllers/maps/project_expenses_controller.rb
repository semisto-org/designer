# The expenses of a project (« Temps et dépenses »): the team notes any of
# them; the client (a viewer) only their own purchases, once the team shows
# them the project (ProjectExpense#writable_by?). A receipt goes up with the
# form (multipart) and comes back through #receipt, which checks who reads.
module Maps
  class ProjectExpensesController < ApplicationController
    include MapScoped
    include ActiveStorage::SetCurrent

    before_action :set_map
    before_action :set_expense, only: %i[update destroy receipt]

    def create
      expense = @map.project_expenses.new(expense_params.merge(user: Current.user, source: params[:source] == "app" ? "app" : "web"))
      expense.vat_rate = ProjectExpense.default_vat_rate(expense.category) if expense_params[:vat_rate].blank?
      return deny unless expense.writable_by?(Current.user)
      if expense.save
        render json: { expense: json(expense) }, status: :created
      else
        render_errors expense
      end
    end

    def update
      return deny unless @expense.writable_by?(Current.user)
      @expense.assign_attributes(expense_params)
      @expense.receipt.detach if params.dig(:expense, :remove_receipt) == "true" && !expense_params.key?(:receipt)
      return deny unless @expense.writable_by?(Current.user)
      if @expense.save
        render json: { expense: json(@expense) }
      else
        render_errors @expense
      end
    end

    def destroy
      return deny unless @expense.writable_by?(Current.user)
      @expense.destroy!
      head :no_content
    end

    # /maps/:map_id/expenses/:id/receipt: a short-lived link to the ticket,
    # for the team, or for the client who added it.
    def receipt
      return head :not_found unless @expense.receipt.attached? && reads_receipt?
      blob = @expense.receipt
      link = blob.image? ? stored_file_url(blob.variant(:large).processed, expires_in: 5.minutes) : stored_file_url(blob, expires_in: 5.minutes)
      expires_in 4.minutes, private: true
      redirect_to link, allow_other_host: true
    end

    private
      def set_expense
        @expense = @map.project_expenses.find(params[:id])
      end

      def team? = TimeEntry.usable_by?(@map, Current.user)

      def reads_receipt?
        team? || (ProjectExpense.client_view?(@map, Current.user) && @expense.user_id == Current.user.id)
      end

      def json(expense)
        url = expense.receipt.attached? ? receipt_map_project_expense_path(@map, expense) : nil
        expense.as_json(client: !team?, viewer: Current.user, receipt_url: url)
      end

      def deny
        render json: { message: t("time_entries.errors.no_access") }, status: :forbidden
      end

      def expense_params
        raw = params.require(:expense).permit(:spent_on, :label, :supplier, :category, :phase, :amount, :vat_rate, :paid_by, :note, :receipt)
        attributes = raw.except(:amount).to_h
        attributes[:amount_cents] = cents(raw[:amount]) if raw.key?(:amount)
        attributes[:phase] = attributes[:phase].presence if attributes.key?(:phase)
        attributes.delete(:receipt) if attributes[:receipt].blank?
        attributes
      end

      # « 12,50 » or « 12.5 » € → 1250; nil when unreadable (the model refuses it).
      def cents(value)
        text = value.to_s.strip.delete(" ").tr(",", ".")
        return nil unless text.match?(/\A\d+(\.\d{1,2})?\z/)
        (BigDecimal(text) * 100).to_i
      end
  end
end
