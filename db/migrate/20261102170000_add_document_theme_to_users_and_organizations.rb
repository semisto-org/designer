# The « charte graphique » of a pro account or a team: colours, fonts and
# footer of the documents it sends (DocumentTheme), and the one its AI
# proposed and nobody reviewed yet.
class AddDocumentThemeToUsersAndOrganizations < ActiveRecord::Migration[8.1]
  def change
    add_column :users, :document_theme, :jsonb, null: false, default: {}
    add_column :users, :document_theme_draft, :jsonb
    add_column :organizations, :document_theme, :jsonb, null: false, default: {}
    add_column :organizations, :document_theme_draft, :jsonb
  end
end
