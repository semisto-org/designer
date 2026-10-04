module Imports
  module Claudy
    # An import that cannot go on, worded in French for the person running it
    # (claudy_import.errors.* in config/locales/claudy_import.fr.yml).
    class Error < StandardError
      attr_reader :key

      def initialize(key, **values)
        @key = key
        super(I18n.t("claudy_import.errors.#{key}", **values))
      end
    end
  end
end
