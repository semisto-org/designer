# Mails around a request sent from a map: one to Semisto (to the addresses in
# SEMISTO_REQUESTS_EMAIL, replying goes to the person), one confirming to the
# person what they sent.
class ServiceRequestMailer < ApplicationMailer
  helper_method :kind_label, :text_line

  def received(service_request)
    load_request(service_request)
    @admin_url = admin_requests_url
    mail to: ServiceRequest.recipients,
      reply_to: email_address_with_name(@user.email_address, @user.display_name),
      subject: t(".subject", kind: kind_label, map: @map.name)
  end

  def confirmation(service_request)
    load_request(service_request)
    mail to: @user.email_address, subject: t(".subject", kind: kind_label)
  end

  private
    def load_request(service_request)
      @request = service_request
      @user = service_request.user
      @map = service_request.map
      @map_url = map_url(@map)
      @summary = ServiceRequest::Summary.new(service_request).lines
    end

    # "Label : value", with multi-line values (plant lists) indented below the label.
    def text_line(line)
      return "#{line[:label]} : #{line[:value]}" unless line[:value].include?("\n")
      "#{line[:label]} :\n" + line[:value].lines.map { |l| "  #{l.strip}" }.join("\n")
    end

    def kind_label
      I18n.t("journey.requests.kinds.#{@request.kind}.title")
    end
end
