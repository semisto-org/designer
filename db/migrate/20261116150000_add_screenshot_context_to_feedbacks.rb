class AddScreenshotContextToFeedbacks < ActiveRecord::Migration[8.1]
  def change
    # What the browser tells about itself (window, screen, language…) and the
    # deployed commit, so nobody has to ask « tu étais sur quoi ? ».
    add_column :feedbacks, :context, :jsonb, null: false, default: {}
    add_column :feedbacks, :app_version, :string
  end
end
