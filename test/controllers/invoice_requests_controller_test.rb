require "test_helper"

class InvoiceRequestsControllerTest < ActionDispatch::IntegrationTest
  include ActionMailer::TestHelper

  setup { @user = users(:bob) }

  def valid_params(**overrides)
    { invoice_request: {
      organization_name: "Administration communale de Yvoir", billing_address: "Rue de l'Hôtel de Ville 1\n5530 Yvoir",
      company_number: "BE0207360311", billing_email: "compta@yvoir.be", purchase_order: "BC-2026-042",
      plan_key: "bureau", message: "Merci !"
    }.merge(overrides) }
  end

  test "signed-out visitors (from the pricing page) sign in first, then come back to the form" do
    get new_invoice_request_path(plan: "bureau")
    assert_redirected_to new_session_path
    assert_equal new_invoice_request_url(plan: "bureau"), session[:return_to_after_authenticating]
    get magic_link_path(@user.generate_token_for(:magic_link))
    assert_redirected_to new_invoice_request_url(plan: "bureau")
  end

  test "the form offers the yearly amount of each plan and defaults to the user's e-mail" do
    sign_in_as @user
    get new_invoice_request_path(plan: "yearly"), headers: inertia_headers
    assert_response :success
    body = response.parsed_body
    assert_equal "invoice_requests/new", body["component"]
    assert_equal({ "planKey" => "yearly", "billingEmail" => "bob@example.org" }, body["props"]["defaults"])
    assert_equal [ 58_800, 118_800, 7_900 ], body["props"]["plans"].map { _1["amountCents"] }
    get new_invoice_request_path(plan: "drone"), headers: inertia_headers
    assert_equal "atelier", response.parsed_body["props"]["defaults"]["planKey"]
  end

  test "sending the form records the request, e-mails Semisto and the requester, and confirms" do
    sign_in_as @user
    assert_enqueued_emails 2 do
      assert_difference "InvoiceRequest.count", 1 do
        post invoice_requests_path, params: valid_params(amount_cents: 1, status: "paid", user_id: users(:alice).id)
      end
    end
    invoice_request = InvoiceRequest.last
    assert_redirected_to invoice_request_path(invoice_request)
    assert_equal [ @user, "requested", 118_800, "BC-2026-042" ], [ invoice_request.user, invoice_request.status, invoice_request.amount_cents, invoice_request.purchase_order ]

    get invoice_request_path(invoice_request), headers: inertia_headers
    props = response.parsed_body["props"]
    assert_equal "invoice_requests/show", response.parsed_body["component"]
    assert_equal [ "Administration communale de Yvoir", "requested", "compta@yvoir.be" ],
      props["invoiceRequest"].values_at("organizationName", "status", "billingEmail")
    assert_equal "bob@example.org", props["userEmail"]
  end

  test "errors come back to the form, field by field, in French" do
    sign_in_as @user
    assert_no_difference "InvoiceRequest.count" do
      post invoice_requests_path, params: valid_params(organization_name: "", billing_email: "nope", plan_key: "drone")
    end
    assert_redirected_to new_invoice_request_path
    follow_redirect!(headers: inertia_headers)
    errors = response.parsed_body["props"]["errors"]
    assert_equal [ "Indique le nom de l'organisation à facturer." ], Array(errors["organization_name"])
    assert_equal [ "Cette adresse e-mail ne semble pas valide." ], Array(errors["billing_email"])
    assert_equal [ "Choisis une formule." ], Array(errors["plan_key"])
  end

  test "a request is only visible to its author" do
    invoice_request = users(:alice).invoice_requests.create!(organization_name: "École", billing_address: "Rue 1\n5000 Namur",
                                                     billing_email: "a@ecole.be", plan_key: "atelier")
    sign_in_as @user
    get invoice_request_path(invoice_request)
    assert_response :not_found
  end

  test "the billing page lists the requests and the plan granted on invoice" do
    invoice_request = @user.invoice_requests.create!(organization_name: "École", billing_address: "Rue 1\n5000 Namur", billing_email: "a@ecole.be", plan_key: "bureau")
    invoice_request.activate!(starts_at: 1.day.ago)
    sign_in_as @user
    get billing_path, headers: inertia_headers
    billing = response.parsed_body["props"]["billing"]
    assert_equal "bureau", billing["plan"]
    assert_equal [ [ "bureau", true, true ] ], billing["grants"].map { _1.values_at("planKey", "active", "onInvoice") }
    assert_equal [ [ "École", "requested", 118_800 ] ], billing["invoiceRequests"].map { _1.values_at("organizationName", "status", "amountCents") }
  end
end
