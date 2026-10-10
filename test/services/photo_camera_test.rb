require "test_helper"

class PhotoCameraTest < ActiveSupport::TestCase
  test "reads a DJI drone's flight and gimbal from its EXIF and XMP blocks" do
    camera = PhotoCamera.read(file_fixture("drone_dji.jpg"))
    assert_equal "DJI", camera["make"]
    assert_equal "FC7203", camera["model"]
    assert_equal "DJI Mavic Mini", camera["model_name"]
    assert camera["drone"]
    assert_in_delta 45.2, camera["relative_altitude_m"]
    assert_in_delta 243.52, camera["absolute_altitude_m"]
    assert_in_delta(-30.1, camera["gimbal_pitch"])
    # DJI writes -58.3; the map's compass runs from 0 to 360.
    assert_in_delta 301.7, camera["gimbal_yaw"]
    assert_in_delta 299.9, camera["flight_yaw"]
    assert_equal 24.0, camera["focal_length_35mm"]
    assert_equal 2.8, camera["f_number"]
    assert_equal "1/500", camera["exposure_time"]
    assert_equal 100, camera["iso"]
  end

  test "a photo without camera tags, or a file that is no image, gives nothing" do
    assert_equal({}, PhotoCamera.read(file_fixture("terrain_gps.jpg")))
    assert_equal({}, PhotoCamera.read(file_fixture("notes.txt")))
  end

  test "reads the element form of the DJI XMP block too" do
    assert_equal(-90.0, PhotoCamera.dji_value("<drone-dji:GimbalPitchDegree>-90.00</drone-dji:GimbalPitchDegree>", "GimbalPitchDegree"))
  end

  test "the heading is the gimbal's, unless the camera looks straight down" do
    assert_equal 301.7, PhotoCamera.heading("gimbal_yaw" => 301.7, "gimbal_pitch" => -30.1)
    assert_nil PhotoCamera.heading("gimbal_yaw" => 301.7, "gimbal_pitch" => -89.9)
    assert_nil PhotoCamera.heading("make" => "Apple")
  end
end
