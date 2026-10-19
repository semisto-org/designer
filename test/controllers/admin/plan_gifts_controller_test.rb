require "test_helper"

class Admin::PlanGiftsControllerTest < ActionDispatch::IntegrationTest
  setup do
    @admin = User.create!(email_address: "staff@example.org", name: "Staff", admin: true)
  end

  test "regular users get a 404" do
    sign_in_as users(:alice)
    post admin_user_plan_gifts_path(users(:bob)), params: { plan_key: "yearly", ends_on: 1.month.from_now.to_date.iso8601 }
    assert_response :not_found
    post admin_plan_gifts_path, params: { plan_key: "yearly", ends_on: 1.month.from_now.to_date.iso8601, created_before: Date.current.iso8601 }
    assert_response :not_found
    assert_empty PlanGrant.all
  end

  test "gives a plan to one account and takes it back, logged" do
    sign_in_as @admin
    ends_on = 3.months.from_now.to_date
    post admin_user_plan_gifts_path(users(:bob)), params: { plan_key: "atelier", ends_on: ends_on.iso8601 }
    assert_redirected_to admin_users_path
    grant = users(:bob).plan_grants.sole
    assert_equal [ "atelier", @admin ], [ grant.plan_key, grant.granted_by ]
    assert_equal "plan_gifted", AdminEvent.newest_first.first.action

    get admin_users_path(q: "bob"), headers: inertia_headers
    row = response.parsed_body["props"]["users"].sole
    assert_equal [ grant.id, "atelier" ], [ row["gift"]["id"], row["plan"] ]

    post admin_revoke_plan_gift_path(grant)
    assert grant.reload.revoked?
    assert_equal "plan_gift_revoked", AdminEvent.newest_first.first.action
  end

  test "gives a plan to every free account created before a date" do
    sign_in_as @admin
    User.update_all(created_at: 1.month.ago)
    post admin_plan_gifts_path, params: { plan_key: "yearly", ends_on: 5.months.from_now.to_date.iso8601, created_before: Date.current.iso8601 }
    assert_redirected_to admin_users_path
    assert_equal User.count, PlanGrant.where(plan_key: "yearly").count
    event = AdminEvent.newest_first.first
    assert_equal [ "plans_gifted", User.count ], [ event.action, event.details["count"] ]
  end

  test "refuses a past date, and never revokes a plan paid on invoice" do
    sign_in_as @admin
    post admin_user_plan_gifts_path(users(:bob)), params: { plan_key: "yearly", ends_on: "2020-01-01" }
    assert_equal "Choisis une formule et une date de fin à venir.", flash[:alert]
    post admin_user_plan_gifts_path(users(:bob)), params: { plan_key: "yearly", ends_on: "pas une date" }
    assert_empty PlanGrant.all
  end
end
