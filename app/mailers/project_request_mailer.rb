# The request form's two e-mails: the account's people learn a request came
# in; the prospect gets a confirmation (« vous », like the offers).
class ProjectRequestMailer < ApplicationMailer
  def received(request, user)
    @request = request
    @form = request.request_form
    @user = user
    @url = request_form_request_url(@form, request)
    mail to: user.email_address, reply_to: request.email,
      subject: t(".subject", name: request.name, place: request.address.presence || @form.display_name)
  end

  def confirmation(request)
    @request = request
    @form = request.request_form
    mail to: request.email, subject: t(".subject", account: @form.display_name)
  end
end
