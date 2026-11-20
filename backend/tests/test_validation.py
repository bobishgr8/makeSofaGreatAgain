import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "app"))
from validation import clean_postal_code, parse_delivery_date, validate_donor_profile, validate_furniture
from datetime import date


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



class DonorProfileExtraTests(unittest.TestCase):
    def test_address_and_consent(self):
        self.assertEqual(
            validate_donor_profile({"address": "1 Road", "consent": {"contactAllowed": True}}), []
        )
        self.assertTrue(validate_donor_profile({"address": "x" * 201}))
        self.assertTrue(validate_donor_profile({"address": 5}))
        self.assertTrue(validate_donor_profile({"consent": "yes"}))
        self.assertTrue(validate_donor_profile({"consent": {"contactAllowed": "yes"}}))


class DonationFormRuleTests(unittest.TestCase):
    def test_prd_conditions_and_old_ones_are_accepted(self):
        for condition in ("like_new", "visible_wear", "minor_defect", "requires_repair", "excellent"):
            self.assertEqual(validate_furniture(valid_furniture(condition=condition)), [])

    def test_details_are_small_and_flat(self):
        self.assertEqual(validate_furniture(valid_furniture(details={"halal": "Halal", "seats": 3})), [])
        self.assertTrue(validate_furniture(valid_furniture(details=["halal"])))
        self.assertTrue(validate_furniture(valid_furniture(details={"x": {"y": 1}})))
        self.assertTrue(validate_furniture(valid_furniture(details={"x": "y" * 501})))
        self.assertTrue(validate_furniture(valid_furniture(details={str(i): "a" for i in range(21)})))

    def test_blank_optional_fields_are_not_errors(self):
        blank = valid_furniture(
            conditionNotes="", dimensionsCm={"width": 0, "depth": 0, "height": 0},
            collection={"floor": "", "deliveryArea": ""},
        )
        self.assertEqual(validate_furniture(blank), [])

    def test_collect_by_date_minimum(self):
        today = date(2026, 11, 21)
        self.assertEqual(parse_delivery_date("2026-11-24", today, 3), "2026-11-24")
        with self.assertRaises(ValueError):
            parse_delivery_date("2026-11-23", today, 3)
        self.assertEqual(parse_delivery_date("2026-11-21", today), "2026-11-21")

    def test_postal_code(self):
        self.assertEqual(clean_postal_code(" 529 889 "), "529889")
        for bad in ("52988", "5298890", "abcdef", None):
            with self.assertRaises(ValueError):
                clean_postal_code(bad)


if __name__ == "__main__":
    unittest.main()
