# Small pieces shared by the e-mails (layouts/mailer).
module MailerHelper
  # « 850 m² », « 2,4 ha ».
  def mail_area(m2)
    return if m2.blank?
    return "#{number_with_delimiter(m2.round, delimiter: "\u202F")}\u202Fm²" if m2 < 10_000
    "#{number_with_precision(m2 / 10_000.0, precision: 1, separator: ",", strip_insignificant_zeros: true)}\u202Fha"
  end

  # « « Le verger », « La mare » et « Le potager » ».
  def mail_place_names(names)
    names.map { "« #{_1} »" }.to_sentence(words_connector: ", ", two_words_connector: " et ", last_word_connector: " et ")
  end

  # What sits under a place's vignette: its area and region.
  def mail_place_caption(place)
    region = place[:region]
    [ mail_area(place[:area_m2]), (region.name if region && region.key != "europe") ].compact.join(" · ")
  end
end
