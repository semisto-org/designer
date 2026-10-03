class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV.fetch("MAIL_FROM", "Semisto Designer <designer@semisto.org>") }
  layout "mailer"
end
