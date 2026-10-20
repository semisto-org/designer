# Adds a blind copy of every outgoing e-mail to the addresses in MAIL_BCC_ADDRESS
# (comma-separated), so the team sees what users receive during the beta.
# Empty or unset: nothing is added. A mail that opens an account (sign-in
# link and code) is never copied: whoever reads the copy could sign in.
# Such a mailer marks the mail with NO_COPY_HEADER, removed before sending.
class MailBccInterceptor
  NO_COPY_HEADER = "X-Terranova-No-Copy"

  def self.addresses
    ENV.fetch("MAIL_BCC_ADDRESS", "").split(",").map(&:strip).reject(&:blank?)
  end

  def self.delivering_email(message)
    if message.header[NO_COPY_HEADER]
      message.header[NO_COPY_HEADER] = nil
      return
    end

    extra = addresses
    return if extra.empty?

    already = [ message.to, message.cc, message.bcc ].flatten.compact.map(&:downcase)
    missing = extra.reject { |address| already.include?(address.downcase) }
    message.bcc = Array(message.bcc) + missing if missing.any?
  end
end
