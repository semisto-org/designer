# « Transférer la carte »: the proposal to the recipient, then the answer
# (accepted or declined) to the owner who made it.
class MapTransferMailer < ApplicationMailer
  def proposed(transfer)
    set_transfer(transfer)
    @url = map_transfer_url(@map, transfer)
    mail to: transfer.to_user.email_address, subject: t(".subject", from: @from.display_name, map: @map.name)
  end

  def accepted(transfer)
    set_transfer(transfer)
    mail to: @from.email_address, subject: t(".subject", to: @to.display_name, map: @map.name)
  end

  def declined(transfer)
    set_transfer(transfer)
    mail to: @from.email_address, subject: t(".subject", to: @to.display_name, map: @map.name)
  end

  private
    def set_transfer(transfer)
      @transfer = transfer
      @map = transfer.map
      @from = transfer.from_user
      @to = transfer.to_user
      @url = map_url(@map)
    end
end
