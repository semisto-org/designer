# Keys of Active Record encryption (`encrypts`: a team's AI API key). Set
# AR_ENCRYPTION_PRIMARY_KEY, AR_ENCRYPTION_DETERMINISTIC_KEY and
# AR_ENCRYPTION_KEY_DERIVATION_SALT (`bin/rails db:encryption:init`) to hold
# them apart; otherwise they are derived from the secret key base, so that
# nothing is ever stored in clear.
derive = ->(purpose) { Rails.application.key_generator.generate_key("active_record_encryption/#{purpose}", 32).unpack1("H*") }

ActiveRecord::Encryption.configure(
  primary_key: ENV["AR_ENCRYPTION_PRIMARY_KEY"].presence || derive.call("primary"),
  deterministic_key: ENV["AR_ENCRYPTION_DETERMINISTIC_KEY"].presence || derive.call("deterministic"),
  key_derivation_salt: ENV["AR_ENCRYPTION_KEY_DERIVATION_SALT"].presence || derive.call("salt")
)
