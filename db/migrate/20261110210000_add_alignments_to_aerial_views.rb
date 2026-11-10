# Each realignment of a drone view (« Recaler la vue »): the landmark pairs
# someone placed, who and when, and how it went. The last one may still be
# running (status "pending"): the view keeps showing its old tiles until the
# new archive replaces them.
class AddAlignmentsToAerialViews < ActiveRecord::Migration[8.1]
  def change
    add_column :aerial_views, :alignments, :jsonb, null: false, default: []
  end
end
