# Where uploaded files live and how they are kept safe: the move from one
# Active Storage service to another (FileStorage::Migration), the nightly copy
# to a backup bucket (FileStorage::Backup) and the CORS rule the browser needs
# to read files straight from a bucket (FileStorage::Cors).
module FileStorage
  module_function

  # A service named in config/storage.yml, ready to be used: a disk always is,
  # an S3 bucket only when its bucket name is set.
  #
  # Read from Active Storage's registry: the configurations are only loaded
  # with ActiveStorage::Blob, which a rake task may not have touched yet.
  def configured?(name)
    config = ActiveStorage::Blob.services.send(:configurations)[name.to_sym]
    return false unless config
    config[:service].to_s != "S3" || config[:bucket].present?
  end

  def service(name) = ActiveStorage::Blob.services.fetch(name.to_sym)

  # Whether the browser may be sent straight to where the file is
  # (ServesStoredFiles): a disk link is on the app's own origin anyway, a
  # bucket link only when the bucket sends CORS headers.
  def direct_downloads?(service) = !service.respond_to?(:bucket) || ENV["S3_DIRECT_DOWNLOADS"] == "true"

  # Every key a service holds, when it can list them in one go (an S3 bucket
  # or a disk), else nil: the caller then asks the service key by key.
  def keys_of(service)
    if service.respond_to?(:bucket)
      service.bucket.objects.each_with_object(Set.new) { |object, keys| keys << object.key }
    elsif service.respond_to?(:root)
      # A disk stores a key under two folders named after its first letters.
      root = Pathname(service.root)
      Dir.glob(root.join("**", "*")).each_with_object(Set.new) do |path, keys|
        keys << Pathname(path).relative_path_from(root).to_s.split("/", 3).last if File.file?(path)
      end
    end
  end

  def holds?(service, keys, key) = keys ? keys.include?(key) : service.exist?(key)

  # Copies one blob's file from its service to `target`, under the same key,
  # checking its checksum on the way.
  def copy(blob, target)
    blob.service.open(blob.key, checksum: blob.checksum, verify: blob.checksum.present?) do |file|
      target.upload(blob.key, file, checksum: blob.checksum, content_type: blob.content_type,
        filename: blob.filename, custom_metadata: blob.custom_metadata)
    end
  end
end
