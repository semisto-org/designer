require "test_helper"
require_relative "../test_helpers/collab_test_helper"
require_relative "../test_helpers/soil_photos_helper"

class DeliverablesControllerTest < ActionDispatch::IntegrationTest
  include SoilPhotosHelper

  setup do
    @map = maps(:ahinvaux)
    @owner = users(:michael)
    @deliverable = MapPublication.publish!(@map, by: @owner, title: "Le dossier de Chris", kind: "deliverable")
  end

  def create_document(**attrs)
    doc = @map.documents.new(uploaded_by: @owner, **attrs)
    doc.file.attach(io: file_fixture("rapport_labo.pdf").open, filename: "rapport_labo.pdf", content_type: "application/pdf")
    doc.save!
    doc
  end

  def sampled(**attrs)
    @map.soil_samples.create!(label: "S1", status: "sampled", depth_from_cm: 0, depth_to_cm: 30, results: { "ph_water" => "6,4" },
      location: MapPhoto.point_from(4.95, 50.34), created_by: @owner, **attrs)
  end

  test "opens without an account, never indexed, with the plan and only the marked files" do
    shown = create_document(title: "Plan de plantation", in_deliverable: true)
    create_document(title: "Offre interne")
    photo = create_photo(in_deliverable: true, caption: "Le verger en arrivant", location: MapPhoto.point_from(4.95, 50.34))
    create_photo(salt: 2, caption: "Réunion d'équipe")
    sample = sampled(in_deliverable: true)
    sampled(label: "S2")
    @map.soil_samples.create!(label: "S3", status: "planned", depth_from_cm: 0, depth_to_cm: 30, in_deliverable: true, created_by: @owner)

    get deliverable_path(@deliverable.token), headers: inertia_headers
    assert_response :success
    assert_equal "noindex, nofollow", response.headers["X-Robots-Tag"]
    props = inertia_props
    assert_equal "deliverables/show", inertia_component
    assert_equal "Le dossier de Chris", props["title"]
    assert_equal [ shown.id ], props.dig("contents", "documents").map { _1["id"] }
    assert_equal [ photo.id ], props.dig("contents", "photos").map { _1["id"] }
    assert_equal [ sample.id ], props.dig("contents", "soilSamples").map { _1["id"] }
    assert_match %r{\A/livrable/#{@deliverable.token}/documents/#{shown.id}/file}, props.dig("contents", "documents", 0, "downloadUrl")
    # Nothing about the people behind the files.
    assert_not_includes response.body, @owner.email_address
    assert_not_includes response.body, "uploadedBy"
  end

  test "a marked file is served, an unmarked one is not, and nothing once unpublished" do
    shown = create_document(in_deliverable: true)
    hidden = create_document
    get deliverable_document_path(@deliverable.token, shown, size: "download")
    assert_response :redirect
    get deliverable_document_path(@deliverable.token, hidden, size: "download")
    assert_response :not_found

    @deliverable.unpublish!
    get deliverable_document_path(@deliverable.token, shown, size: "download")
    assert_response :gone
    get deliverable_path(@deliverable.token)
    assert_response :gone
  end

  test "photos: only stills of photos marked themselves, never the original" do
    marked = create_photo(in_deliverable: true)
    other = create_photo(salt: 2)
    sample = sampled(in_deliverable: true)
    of_sample = create_photo(salt: 3, soil_sample: sample)
    marked_of_sample = create_photo(salt: 4, soil_sample: sample, in_deliverable: true)

    get deliverable_photo_path(@deliverable.token, marked, size: "original")
    assert_response :redirect
    assert_no_match(/terrain\.jpg\z/, URI(response.location).path) # the large still, not the file
    get deliverable_photo_path(@deliverable.token, marked_of_sample, size: "thumb")
    assert_response :redirect
    # A marked soil point never sends its other photos along (a price list photographed on site).
    get deliverable_photo_path(@deliverable.token, of_sample, size: "thumb")
    assert_response :not_found
    get deliverable_photo_path(@deliverable.token, other, size: "thumb")
    assert_response :not_found
  end

  test "a soil point shows only its photos marked themselves, its notes never, and the counts say it all" do
    sample = sampled(in_deliverable: true, notes: "Prix équipe : 12 €/m³")
    create_photo(salt: 5, soil_sample: sample, caption: "Bon de commande, prix équipe")
    core = create_photo(salt: 6, soil_sample: sample, in_deliverable: true, caption: "La carotte")
    planned = @map.soil_samples.create!(label: "S9", status: "planned", depth_from_cm: 0, depth_to_cm: 30, created_by: @owner)
    elsewhere = create_photo(salt: 7, soil_sample: planned, in_deliverable: true)
    loose = create_photo(salt: 8, in_deliverable: true)

    get deliverable_path(@deliverable.token), headers: inertia_headers
    contents = inertia_props["contents"]
    assert_equal [ core.id ], contents.dig("soilSamples", 0, "photos").map { _1["id"] }
    # Shown once: under its point, not again in the gallery.
    assert_equal [ elsewhere.id, loose.id ].sort, contents["photos"].map { _1["id"] }.sort
    assert_not_includes response.body, "prix équipe"
    assert_not_includes response.body, "12 €/m³"
    assert_equal 3, Deliverable::Contents.new(@map).counts[:photos]
  end

  test "lab reports of a marked point only" do
    sample = sampled(in_deliverable: true)
    sample.lab_reports.attach(io: file_fixture("analyse_sol.pdf").open, filename: "analyse_sol.pdf", content_type: "application/pdf")
    report = sample.lab_reports.first
    get deliverable_soil_report_path(@deliverable.token, sample, report_id: report.id)
    assert_response :redirect
    sample.update!(in_deliverable: false)
    get deliverable_soil_report_path(@deliverable.token, sample, report_id: report.id)
    assert_response :not_found
  end

  test "the public view's token does not open a deliverable, and a deliverable's /p/ address sends to its page" do
    public_view = MapPublication.publish!(@map, by: @owner, title: "Le jardin")
    get deliverable_path(public_view.token)
    assert_response :not_found
    get public_map_path(@deliverable.token)
    assert_redirected_to "/livrable/#{@deliverable.token}"
  end

  private
    def inertia_props = JSON.parse(response.body)["props"]
    def inertia_component = JSON.parse(response.body)["component"]
end
