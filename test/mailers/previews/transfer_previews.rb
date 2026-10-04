# Preview the map transfer e-mails in development: /rails/mailers
class MapTransferMailerPreview < ActionMailer::Preview
  def proposed = MapTransferMailer.proposed(transfer)
  def accepted = MapTransferMailer.accepted(transfer(status: "accepted"))
  def declined = MapTransferMailer.declined(transfer(status: "declined"))

  private
    def transfer(status: "pending")
      from = User.new(id: 1, name: "Camille", email_address: "camille@example.org")
      to = User.new(id: 2, name: "Dominique", email_address: "dominique@example.org")
      map = Map.new(id: 1, name: "Le verger du bas", owner: from)
      MapTransfer.new(id: 1, map:, from_user: from, to_user: to, status:, expires_at: MapTransfer::EXPIRES_IN.from_now)
    end
end
