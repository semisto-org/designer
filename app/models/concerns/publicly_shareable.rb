# A photo, a video or a document an editor can show to someone outside the
# map (« Lien public »): a secret link that opens that file alone, without
# an account (SharedFilesController), until an editor cuts it. Nothing else
# of the map comes with it, and a photo goes out without its EXIF block.
module PubliclyShareable
  extend ActiveSupport::Concern

  # Long enough not to be guessed; base58 reads well in a message.
  TOKEN_LENGTH = 24

  def publicly_shared? = share_token.present?

  # `public_link: true` makes the link (keeping the one already given),
  # `false` cuts it: the old address then answers « lien coupé ».
  def public_link=(value)
    on = ActiveModel::Type::Boolean.new.cast(value) == true
    self.share_token = on ? (share_token.presence || SecureRandom.base58(TOKEN_LENGTH)) : nil
  end

  # The address, relative to the app's origin, or nil when there is no link.
  def public_path
    return nil unless publicly_shared?
    "/partage/#{self.class::PUBLIC_LINK_SEGMENT}/#{share_token}"
  end
end
