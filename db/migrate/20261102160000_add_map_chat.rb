# The map's live discussion (« Discussion de la carte »): who may join it
# besides the owner, editors and team (a viewer, person by person), what a
# message points at on the map (cited elements, a pinned spot, a photo), and
# the e-mail digest of unread messages.
class AddMapChat < ActiveRecord::Migration[8.1]
  def change
    add_column :map_memberships, :chat_access, :boolean, default: false, null: false
    add_column :map_invitations, :chat_access, :boolean, default: false, null: false

    add_column :comments, :feature_ids, :bigint, array: true, default: [], null: false
    add_column :comments, :location, :geometry, limit: { srid: 4326, type: "st_point" }
    add_reference :comments, :map_photo, foreign_key: { on_delete: :nullify }, index: true

    # Muting the map's discussion e-mails (the digest), kept on the follow row.
    add_column :comment_subscriptions, :muted, :boolean, default: false, null: false
    # Unread chat messages up to this time were already sent in a digest.
    add_column :comment_reads, :emailed_until, :datetime
    # When the next digest of the map's discussion is due (one job at a time).
    add_column :maps, :chat_digest_at, :datetime
  end
end
