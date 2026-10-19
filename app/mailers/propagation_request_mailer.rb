# The e-mails of a request for scions, cuttings or seeds (PropagationRequest):
# to each owner of the place when it arrives, then to the requester once an
# owner answers. Addresses are only given away on acceptance.
class PropagationRequestMailer < ApplicationMailer
  before_action do
    @request = params[:request]
    @map = @request.map
    @url = propagation_requests_url
  end

  def received
    @owner = params[:owner]
    mail to: @owner.email_address,
         subject: t(".subject", requester: @request.requester.display_name, plant: @request.plant_name)
  end

  # The owner who accepted writes back to the requester directly.
  def accepted
    @owner = @request.answered_by
    mail to: @request.requester.email_address, reply_to: @owner&.email_address,
         subject: t(".subject", plant: @request.plant_name)
  end

  def declined
    mail to: @request.requester.email_address, subject: t(".subject", plant: @request.plant_name)
  end
end
