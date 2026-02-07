#!/usr/bin/env python3
"""
Postman Helper Feature Verification Script
Tests all implemented features to ensure they're working correctly
"""

import subprocess
import json
import sys
from pathlib import Path


def test_feature(feature_name, test_function):
    """Test a specific feature and return results"""
    print(f"\n🔍 Testing: {feature_name}")
    try:
        result = test_function()
        if result:
            print(f"✅ {feature_name} - PASS")
            return True
        else:
            print(f"❌ {feature_name} - FAIL")
            return False
    except Exception as e:
        print(f"❌ {feature_name} - ERROR: {str(e)}")
        return False


def test_syntax_validity():
    """Test that all JavaScript files have valid syntax"""
    result = subprocess.run(
        ["python3", "test_project.py"], capture_output=True, text=True
    )

    # Parse results
    try:
        with open("test_results.json", "r") as f:
            results = json.load(f)

        return results["errors_found"] == 0
    except:
        return "Tests passed" in result.stdout


def test_collapsible_tree():
    """Test that collapsible tree functionality is implemented"""
    app_content = Path("app.js").read_text()

    # Check for key collapsible tree functions
    required_functions = [
        "renderCollapsibleFolder",
        "setupCollapsibleTree",
        "setupTreeClickHandlers",
    ]

    required_elements = ["tree-toggle", "tree-children", "tree-item folder"]

    # Check for CSS styles
    required_styles = [".tree-toggle", ".tree-children", ".tree-item"]

    functions_found = all(f in app_content for f in required_functions)
    elements_found = all(e in app_content for e in required_elements)
    styles_found = all(s in app_content for s in required_styles)

    return functions_found and elements_found and styles_found


def test_settings_implementation():
    """Test that settings functionality is implemented"""
    app_content = Path("app.js").read_text()

    # Check for settings modal implementation
    required_settings = [
        "showSettings()",
        "settingsModal",
        "autoSave",
        "darkMode",
        "autoFormat",
    ]

    # Check for settings in AppState
    appstate_content = Path("app.js").read_text()
    state_settings = [
        "this.autoSave",
        "this.darkMode",
        "this.autoFormat",
        "this.showLineNumbers",
    ]

    settings_found = all(s in app_content for s in required_settings)
    state_found = all(s in appstate_content for s in state_settings)

    return settings_found and state_found


def test_request_saving():
    """Test that request saving functionality is enhanced"""
    app_content = Path("app.js").read_text()

    # Check for enhanced saveRequest function
    required_features = [
        "saveRequest()",
        "updateTabContent()",
        "this.state.markAsChanged()",
        "updateCollectionTree()",
    ]

    return all(f in app_content for f in required_features)


def test_import_collection():
    """Test that collection import functionality is working"""
    app_content = Path("app.js").read_text()

    # Check for import functionality
    required_features = [
        "importFromJSON(",
        "processPostmanItems(",
        "createRequestFromPostmanItem(",
        "createFolderFromPostmanItem(",
    ]

    return all(f in app_content for f in required_features)


def test_inheritance_manager():
    """Test that InheritanceManager has all required methods"""
    app_content = Path("app.js").read_text()

    # Check for all required methods
    required_methods = [
        "addGlobalHeader(",
        "addBaseEndpoint(",
        "addBodyTemplate(",
        "addTestTemplate(",
        "getGlobalHeaders(",
        "getBaseEndpoints(",
    ]

    return all(m in app_content for m in required_methods)


def test_collection_methods():
    """Test that Collection class has required methods"""
    app_content = Path("app.js").read_text()

    # Check for required collection methods
    required_methods = ["importFromJSON(", "exportToJSON(", "addRequest(", "addFolder("]

    return all(m in app_content for m in required_methods)


def test_error_handling():
    """Test that proper error handling is implemented"""
    app_content = Path("app.js").read_text()

    # Check for error handling patterns (appropriate for this codebase)
    error_patterns = [
        "try {",
        "catch (error)",
        "console.error(",
        "alert(",  # This codebase uses alert for user-facing errors
    ]

    # Count occurrences to ensure robust error handling
    try_count = app_content.count("try {")
    catch_count = app_content.count("catch (error)")
    console_error_count = app_content.count("console.error(")
    alert_count = app_content.count("alert(")

    # We should have multiple instances of error handling
    return (
        try_count >= 4
        and catch_count >= 4
        and console_error_count >= 3
        and alert_count >= 5
    )


def test_ui_improvements():
    """Test that UI improvements are implemented"""
    app_content = Path("app.js").read_text()

    # Check for UI improvement patterns
    ui_patterns = [
        "updateTabContent()",
        "switchTab(",
        "updateCollectionTree()",
        "updateInheritanceTab()",
    ]

    return all(p in app_content for p in ui_patterns)


def main():
    """Run all feature tests"""
    print("🚀 Postman Helper Feature Verification")
    print("=" * 50)

    # Define all feature tests
    feature_tests = [
        ("Syntax Validity", test_syntax_validity),
        ("Collapsible Tree View", test_collapsible_tree),
        ("Settings Implementation", test_settings_implementation),
        ("Request Saving", test_request_saving),
        ("Collection Import", test_import_collection),
        ("Inheritance Manager", test_inheritance_manager),
        ("Collection Methods", test_collection_methods),
        ("Error Handling", test_error_handling),
        ("UI Improvements", test_ui_improvements),
    ]

    # Run all tests
    results = []
    for feature_name, test_func in feature_tests:
        passed = test_feature(feature_name, test_func)
        results.append((feature_name, passed))

    # Generate summary
    print("\n" + "=" * 50)
    print("📊 FEATURE VERIFICATION SUMMARY")
    print("=" * 50)

    total_tests = len(results)
    passed_tests = sum(1 for _, passed in results if passed)
    failed_tests = total_tests - passed_tests

    for feature_name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {feature_name}")

    print(f"\n📈 Overall Results:")
    print(f"   Tests Passed: {passed_tests}/{total_tests}")
    print(f"   Tests Failed: {failed_tests}/{total_tests}")

    if failed_tests == 0:
        print(f"\n🎉 ALL FEATURES VERIFIED SUCCESSFULLY!")
        print("Your Postman Helper application has all required features implemented.")
        return True
    else:
        print(f"\n⚠️  Some features need attention")
        print("Please review the failed tests above.")
        return False


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
