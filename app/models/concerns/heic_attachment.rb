# Converts a HEIC photo being attached to JPEG, before validation, so the rest
# of the model (allowed types, checksum, variants) only ever sees a JPEG.
#
#   converts_heic :image
#
# Declare it before the other before_validation callbacks. A file libvips
# cannot decode is left as it is: the model's type validation refuses it.
module HeicAttachment
  extend ActiveSupport::Concern

  class_methods do
    def converts_heic(name)
      before_validation { convert_heic_attachment(name.to_s) }
    end
  end

  private
    def convert_heic_attachment(name)
      change = attachment_changes[name]
      return unless change.is_a?(ActiveStorage::Attached::Changes::CreateOne)
      return unless HeicImage.heic?(change.blob.content_type)
      attachable = change.attachable
      io = attachable.is_a?(Hash) ? attachable[:io] : attachable
      return unless io.respond_to?(:read)

      io.rewind if io.respond_to?(:rewind)
      jpeg = HeicImage.to_jpeg(io.read)
      # The setter only records the change (attach would save a persisted record).
      public_send("#{name}=", io: StringIO.new(jpeg), filename: HeicImage.jpeg_filename(change.blob.filename), content_type: "image/jpeg")
    rescue HeicImage::Error => error
      Rails.logger.warn("[heic] #{self.class.name} #{name}: #{error.message}")
      io.rewind if io.respond_to?(:rewind)
    end
end
