# /account/charte — the charter of a pro account's documents (DocumentThemeActions).
module Account
  class DocumentThemesController < ApplicationController
    include DocumentThemeActions
    forbid_while_impersonating only: %i[update accept_draft reject_draft]

    private
      def theme_holder = Current.user
      def theme_editable? = true
      def theme_path = account_document_theme_path

      def holder_props
        user = Current.user
        { kind: "account", name: user.display_name, logoUrl: user.logo_url, logoEndpoint: "/account/logo", logoParam: "user",
          endpoint: theme_path, back: account_path }
      end
  end
end
