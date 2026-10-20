class ApplicationMailer < ActionMailer::Base
  default from: -> { ENV.fetch("MAIL_FROM", "Semisto Terranova <designer@semisto.org>") }
  layout "mailer"
  helper MailerHelper

  private
    # The place the message is about, at the top of the e-mail: its vignette
    # (inline, so it shows without loading remote images), name, area and
    # link. Call before `mail`. Only for people who may see the map.
    def show_place(map)
      return unless map
      @place = { name: map.name, area_m2: map.area_m2, region: map.region, url: map_url(map) }
      png = MapVignette.png(map)
      return unless png
      attachments.inline["lieu.png"] = { mime_type: "image/png", content: png }
      @place[:image] = "lieu.png"
    end

    # The places a plan covers, for the e-mails about money: the oldest one's
    # vignette, and the names of the others (« Elle couvre … »).
    def show_places(user)
      maps = user.billed_maps.order(:created_at, :id).limit(4).to_a
      @place_names = maps.map(&:name)
      show_place(maps.first)
    end
end
