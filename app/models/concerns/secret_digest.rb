# Random bearer secrets (tokens, codes) and their SHA-256 digests. Only
# digests are stored; a secret is shown once to whoever it was issued to.
module SecretDigest
  def self.generate(prefix = nil)
    secret = SecureRandom.base58(40)
    prefix ? "#{prefix}_#{secret}" : secret
  end

  def self.digest(secret)
    OpenSSL::Digest::SHA256.hexdigest(secret.to_s)
  end

  def self.matches?(secret, digest)
    digest.present? && secret.present? && ActiveSupport::SecurityUtils.secure_compare(digest(secret), digest)
  end
end
