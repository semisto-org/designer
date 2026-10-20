# « Ton lieu avant ton compte »: a trial now also starts from the home page
# (origin, to count which door people use), and can be kept by typing an
# e-mail on the trial itself: the claimant is the account the sign-in link
# was sent to, so the trial becomes their map whichever device opens it.
class AddOriginAndClaimantToMapTrials < ActiveRecord::Migration[8.1]
  def change
    add_column :map_trials, :origin, :string, default: "direct", null: false
    add_reference :map_trials, :claimant, foreign_key: { to_table: :users, on_delete: :nullify }
  end
end
