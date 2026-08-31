import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from validation import validate_donor_profile, validate_furniture


def valid_furniture(**overrides):
    item = {
        "title": "Three-seater sofa",
        "condition": "good",
        "conditionNotes": "Light wear on the armrests.",
        "quantity": 2,
        "subcategory": "three-seater",
        "dimensionsCm": {"width": 180, "depth": 90, "height": 80},
        "photos": [{"url": "https://example.com/a.jpg", "isPrimary": True}],
        "collection": {
            "floor": 4,
            "fitsInLift": "yes",
            "disassembly": "no",
            "deliveryArea": "local",
            "deadlineType": "flexible",
        },
    }
    item.update(overrides)
    return item


class FurnitureValidationTests(unittest.TestCase):
    def test_accepts_a_well_formed_listing(self):
        self.assertEqual(validate_furniture(valid_furniture()), [])

    def test_rejects_negative_quantity(self):
        errors = validate_furniture(valid_furniture(quantity=-9999))
        self.assertTrue(any("Quantity" in error for error in errors))

    def test_rejects_zero_quantity(self):
        errors = validate_furniture(valid_furniture(quantity=0))
        self.assertTrue(any("Quantity" in error for error in errors))

    def test_rejects_quantity_above_the_cap(self):
        errors = validate_furniture(valid_furniture(quantity=9999))
        self.assertTrue(any("Quantity" in error for error in errors))

    def test_rejects_fractional_quantity(self):
        errors = validate_furniture(valid_furniture(quantity=2.5))
        self.assertTrue(any("Quantity" in error for error in errors))

    def test_rejects_non_numeric_quantity(self):
        errors = validate_furniture(valid_furniture(quantity="a lot"))
        self.assertTrue(any("Quantity" in error for error in errors))

    def test_rejects_negative_dimensions(self):
        errors = validate_furniture(
            valid_furniture(dimensionsCm={"width": -50, "depth": 90, "height": 80})
        )
        self.assertTrue(any("width" in error for error in errors))

    def test_rejects_absurdly_large_dimensions(self):
        errors = validate_furniture(
            valid_furniture(dimensionsCm={"width": 100000, "depth": 90, "height": 80})
        )
        self.assertTrue(any("width" in error for error in errors))

    def test_rejects_negative_floor(self):
        errors = validate_furniture(
            valid_furniture(collection={**valid_furniture()["collection"], "floor": -3})
        )
        self.assertTrue(any("Floor" in error for error in errors))

    def test_rejects_unreasonably_high_floor(self):
        errors = validate_furniture(
            valid_furniture(collection={**valid_furniture()["collection"], "floor": 9999})
        )
        self.assertTrue(any("Floor" in error for error in errors))

    def test_rejects_too_many_photos(self):
        photos = [{"url": f"https://example.com/{i}.jpg"} for i in range(6)]
        errors = validate_furniture(valid_furniture(photos=photos))
        self.assertTrue(any("photos" in error for error in errors))

    def test_rejects_blank_title(self):
        errors = validate_furniture(valid_furniture(title=""))
        self.assertTrue(any("Title" in error for error in errors))

    def test_rejects_title_over_the_length_cap(self):
        errors = validate_furniture(valid_furniture(title="x" * 200))
        self.assertTrue(any("Title" in error for error in errors))

    def test_rejects_condition_notes_that_are_too_short(self):
        errors = validate_furniture(valid_furniture(conditionNotes="ok"))
        self.assertTrue(any("Condition notes" in error for error in errors))

    def test_rejects_unknown_condition(self):
        errors = validate_furniture(valid_furniture(condition="brand_new"))
        self.assertTrue(any("Condition" in error for error in errors))

    def test_rejects_unknown_delivery_area(self):
        errors = validate_furniture(
            valid_furniture(
                collection={**valid_furniture()["collection"], "deliveryArea": "teleport"}
            )
        )
        self.assertTrue(any("Delivery area" in error for error in errors))

    def test_ignores_fields_that_are_absent_for_partial_updates(self):
        # A donor PATCHing just the title shouldn't be forced to resend
        # dimensions/collection/etc.
        self.assertEqual(validate_furniture({"title": "Updated title"}), [])


class DonorProfileValidationTests(unittest.TestCase):
    def test_accepts_a_well_formed_profile(self):
        errors = validate_donor_profile({"displayName": "Wang Potao", "phone": "+65 9123 4567"})
        self.assertEqual(errors, [])

    def test_accepts_missing_optional_fields(self):
        self.assertEqual(validate_donor_profile({}), [])

    def test_rejects_a_malformed_phone_number(self):
        errors = validate_donor_profile({"phone": "not-a-number"})
        self.assertTrue(any("phone number" in error for error in errors))

    def test_rejects_a_too_short_phone_number(self):
        errors = validate_donor_profile({"phone": "123"})
        self.assertTrue(any("phone number" in error for error in errors))

    def test_rejects_a_display_name_over_the_length_cap(self):
        errors = validate_donor_profile({"displayName": "x" * 200})
        self.assertTrue(any("Contact name" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
