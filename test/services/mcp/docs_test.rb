require "test_helper"

class Mcp::DocsTest < ActiveSupport::TestCase
  test "every tool and parameter has a French title and description" do
    Mcp::Docs.tools.each do |tool|
      [ tool[:title], tool[:description] ].each { |text| refute_match(/translation missing/i, text, tool[:name]) }
      tool[:parameters].each do |param|
        assert param[:description].present?, "#{tool[:name]}.#{param[:name]} has no description"
        refute_match(/translation missing/i, param[:description], "#{tool[:name]}.#{param[:name]}")
      end
    end
  end

  test "tool schemas are strict and valid JSON Schema" do
    Mcp::Tools.all.each do |tool|
      schema = tool.input_schema.to_h
      assert_equal false, schema[:additionalProperties], tool.name_value
      assert_match(/\A[a-z_]+\z/, tool.name_value)
    end
  end
end
