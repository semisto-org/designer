require "test_helper"

class InvoicingMailerTest < ActionMailer::TestCase
  setup do
    @user = users(:bob)
    @request = @user.invoice_requests.create!(
      organization_name: "Administration communale de Yvoir", billing_address: "Rue de l'Hôtel de Ville 1\n5530 Yvoir",
      billing_email: "compta@yvoir.be", company_number: "BE0207360311", purchase_order: "BC-2026-042", plan_key: "bureau",
      message: "Merci de mentionner le service Environnement"
    )
  end

  test "request_received: to Semisto, reply to the requester, with every detail and the staff screen" do
    mail = InvoicingMailer.request_received(@request)
    assert_equal [ "designer@semisto.org" ], mail.to
    assert_equal [ "bob@example.org" ], mail.reply_to
    assert_equal "Demande de facture : Administration communale de Yvoir (Bureau d'études)", mail.subject
    text = mail.text_part.body.to_s
    [ "Bob (bob@example.org) demande à payer sur facture.", "5530 Yvoir", "BE0207360311", "compta@yvoir.be", "BC-2026-042",
      "Bureau d'études, pour un an", "1 188 €, TVA comprise", "service Environnement", "http://example.com/admin/invoice-requests" ].each do |fragment|
      assert_includes text, fragment
    end
    assert_includes mail.html_part.body.to_s, "Ouvrir les demandes de facture"
  end

  test "request_received honours SEMISTO_CONTACT_EMAIL" do
    original = ENV["SEMISTO_CONTACT_EMAIL"]
    ENV["SEMISTO_CONTACT_EMAIL"] = "facturation@semisto.org"
    assert_equal [ "facturation@semisto.org" ], InvoicingMailer.request_received(@request).to
  ensure
    original ? ENV["SEMISTO_CONTACT_EMAIL"] = original : ENV.delete("SEMISTO_CONTACT_EMAIL")
  end

  test "request_confirmation: to the requester, with the recap, where the invoice goes, and the purchase order" do
    mail = InvoicingMailer.request_confirmation(@request)
    assert_equal [ "bob@example.org" ], mail.to
    assert_equal "Votre demande de facture pour Semisto Designer", mail.subject
    text = mail.text_part.body.to_s
    assert_includes text, "Bonjour Bob,"
    assert_includes text, "« Administration communale de Yvoir »"
    assert_includes text, "La facture sera envoyée à compta@yvoir.be, payable par virement sous 30 jours."
    assert_includes text, "bon de commande n° BC-2026-042"
    assert_includes text, "http://example.com/billing"
    assert_includes mail.html_part.body.to_s, "Suivre ma demande"
  end

  test "plan_activated: the plan and its dates" do
    grant = @request.activate!(starts_at: Time.zone.local(2026, 10, 4))
    mail = InvoicingMailer.plan_activated(grant)
    assert_equal [ "bob@example.org" ], mail.to
    assert_equal "Votre formule Bureau d'études est activée", mail.subject
    assert_includes mail.text_part.body.to_s, "du 4 octobre 2026 au 4 octobre 2027, réglée sur facture"
    assert_includes mail.text_part.body.to_s, "http://example.com/maps"
  end

  test "grant_reminder: when the plan ends and how to ask for the next invoice" do
    grant = @request.activate!(starts_at: Time.zone.local(2026, 10, 4))
    mail = InvoicingMailer.grant_reminder(grant, "d30")
    assert_equal "Votre formule Semisto Designer se termine le 4 octobre 2027", mail.subject
    text = mail.text_part.body.to_s
    assert_includes text, "Votre formule Bureau d'études, réglée sur facture, est valable jusqu'au 4 octobre 2027"
    assert_includes text, "http://example.com/billing/invoice?plan=bureau"
    assert_match "Plus que 7 jours", InvoicingMailer.grant_reminder(grant, "d7").subject
    assert_equal "Votre formule Semisto Designer est arrivée à échéance", InvoicingMailer.grant_reminder(grant, "expired").subject
    assert_includes InvoicingMailer.grant_reminder(grant, "expired").text_part.body.to_s, "Votre première carte reste entièrement modifiable"
  end
end
