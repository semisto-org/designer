class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV.fetch("MAIL_FROM", "Semisto Terranova <designer@semisto.org>") }
  layout "mailer"
end
