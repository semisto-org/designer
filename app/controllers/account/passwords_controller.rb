# /account/password — the optional password. Choosing a first one needs no
# old one (the person is signed in); changing or removing it asks for the
# current one, and signs out the other browsers.
module Account
  class PasswordsController < ApplicationController
    forbid_while_impersonating
    rate_limit to: 10, within: 10.minutes, with: -> { redirect_to account_path, alert: t("sessions.rate_limited") }

    def update
      user = Current.user
      had_password = user.password?
      return refuse(:current_password, t("account.password.wrong_current")) unless current_password_ok?(user)

      password, confirmation = params.require(:user).values_at(:password, :password_confirmation).map(&:to_s)
      return refuse(:password, user.errors.generate_message(:password, :blank)) if password.empty?

      if user.update(password:, password_confirmation: confirmation)
        sign_out_other_sessions(user) if had_password
        redirect_to account_path, notice: t("account.password.saved"), status: :see_other
      else
        redirect_to account_path, inertia: { errors: user.errors }, status: :see_other
      end
    end

    def destroy
      user = Current.user
      return refuse(:current_password, t("account.password.wrong_current")) unless current_password_ok?(user)

      user.update!(password: nil)
      sign_out_other_sessions(user)
      redirect_to account_path, notice: t("account.password.removed"), status: :see_other
    end

    private
      def current_password_ok?(user)
        !user.password? || user.authenticate(params.dig(:user, :current_password).to_s).present?
      end

      def refuse(field, message)
        redirect_to account_path, inertia: { errors: { field => message } }, status: :see_other
      end

      def sign_out_other_sessions(user)
        user.sessions.where.not(id: Current.session.id).destroy_all
      end
  end
end
