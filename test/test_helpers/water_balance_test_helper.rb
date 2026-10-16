# Thirty-year monthly means of a place in the Condroz (ERA5-Land, Yvoir).
module WaterBalanceTestHelper
  YVOIR_MONTHS = [
    [ 80, 4.7, 0.1, 2.4 ], [ 77, 6.4, 0.6, 3.4 ], [ 73, 9.6, 1.9, 5.7 ], [ 62, 13.1, 4.3, 8.8 ],
    [ 76, 16.7, 8.1, 12.6 ], [ 81, 19.9, 11.3, 15.9 ], [ 85, 21.5, 13.2, 17.5 ], [ 89, 21.6, 13.4, 17.6 ],
    [ 66, 18.3, 10.6, 14.4 ], [ 74, 14.2, 8.1, 11.0 ], [ 74, 8.8, 3.9, 6.3 ], [ 88, 5.5, 1.2, 3.3 ]
  ].each_with_index.map do |(rain, max, min, mean), i|
    { "month" => i + 1, "rain_mm" => rain, "mean_max_c" => max, "mean_min_c" => min, "mean_temp_c" => mean }
  end.freeze
end
