module Billing
  # "4 octobre 2027", for e-mails and flash messages (the app has no French
  # date formats of its own; pages format dates in the browser).
  module FrenchDate
    module_function

    def long(time)
      date = time.respond_to?(:in_time_zone) ? time.in_time_zone.to_date : time.to_date
      "#{date.day} #{I18n.t('billing_mailer.months')[date.month - 1]} #{date.year}"
    end
  end
end
