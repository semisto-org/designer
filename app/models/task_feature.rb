# Links a task to an element of the same map it is about (a plant, a
# hedge…). Deleting either side deletes the link.
class TaskFeature < ApplicationRecord
  belongs_to :task
  belongs_to :map_feature
end
