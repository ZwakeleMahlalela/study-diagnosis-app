import { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Button,
  ActivityIndicator,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import Purchases from "react-native-purchases";

// TODO: replace with your actual Supabase project URL and anon key
const SUPABASE_URL = "https://uxnldchxaeflihowpxkl.supabase.co";
const ANON_KEY = "sb_publishable_WeFoU284NoH4i_fIcOxnTg_stZVRxpj";

// TODO: replace with your RevenueCat Test Store API key (starts with test_)
const REVENUECAT_API_KEY = "test_mGhmcgkcGABkJhQHTYaBPMPrQeK";

// This must match the entitlement identifier you created in RevenueCat
const PREMIUM_ENTITLEMENT_ID = "premium";
// This must match the package identifier inside your RevenueCat offering
const PREMIUM_PACKAGE_ID = "premium";

// Turns raw JS error messages (often cryptic, e.g. from a dropped connection)
// into something a user can actually act on.
const friendlyErrorMessage = (err) => {
  const msg = err?.message || String(err);
  if (msg.includes("Network request failed") || msg.includes("fetch")) {
    return "Couldn't reach the server. Check your internet connection and try again.";
  }
  return "Something went wrong. Please try again.";
};

// Reads any file URI (including content:// URIs from the document picker)
// into a base64 string, using RN's built-in fetch + FileReader instead of
// expo-file-system, which sidesteps Expo Go's cache-directory sandboxing issue.
const uriToBase64 = (uri) => {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();

      const reader = new FileReader();
      reader.onload = () => {
        // reader.result looks like "data:application/pdf;base64,JVBERi0xLj..."
        // we only want the part after the comma
        const base64 = reader.result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    } catch (err) {
      reject(err);
    }
  });
};

export default function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [question, setQuestion] = useState(null);
  const [askedQuestions, setAskedQuestions] = useState([]);
  const [answer, setAnswer] = useState("");
  const [gradingResult, setGradingResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasPremium, setHasPremium] = useState(false);
  const [purchasing, setPurchasing] = useState(false);

  // Runs once when the app starts: connect to RevenueCat and check whether
  // this user already has the premium entitlement (e.g. from a past purchase).
  useEffect(() => {
    Purchases.configure({ apiKey: REVENUECAT_API_KEY });

    Purchases.getCustomerInfo()
      .then((info) => {
        const isPremium =
          typeof info.entitlements.active[PREMIUM_ENTITLEMENT_ID] !==
          "undefined";
        setHasPremium(isPremium);
      })
      .catch((err) => {
        console.log("Error checking entitlement status:", err);
      });
  }, []);

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return;
    }

    const file = result.assets[0];

    // Guard against PDFs large enough to hit API limits or make requests
    // slow/expensive — 15MB covers the vast majority of lecture slide decks.
    const MAX_SIZE_BYTES = 15 * 1024 * 1024;
    if (file.size && file.size > MAX_SIZE_BYTES) {
      setError(
        "That PDF is quite large (over 15MB). Try a smaller file or split it into sections."
      );
      return;
    }

    setSelectedFile(file);
    setQuestion(null);
    setAskedQuestions([]);
    setAnswer("");
    setGradingResult(null);
    setError(null);
  };

  const generateQuestion = async () => {
    if (!selectedFile) return;

    setLoading(true);
    setError(null);
    setAnswer("");
    setGradingResult(null);

    try {
      const base64 = await uriToBase64(selectedFile.uri);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/generate-question`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ANON_KEY}`,
            apikey: ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pdfBase64: base64,
            previousQuestions: askedQuestions,
          }),
        }
      );

      const data = await response.json();

      if (data.question) {
        setQuestion(data.question);
        setAskedQuestions((prev) => [...prev, data.question]);
      } else if (data.error) {
        setError(`Server error: ${data.error}`);
      } else if (data.debug_raw_response) {
        setError(
          `Unexpected response: ${JSON.stringify(data.debug_raw_response)}`
        );
      } else {
        setError("Something went wrong generating the question.");
      }
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const gradeAnswer = async () => {
    if (!selectedFile || !question) return;

    if (!answer.trim()) {
      setError("Please type an answer before submitting.");
      return;
    }

    setLoading(true);
    setError(null);
    setGradingResult(null);

    try {
      const base64 = await uriToBase64(selectedFile.uri);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/grade-answer`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${ANON_KEY}`,
            apikey: ANON_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ pdfBase64: base64, question, answer }),
        }
      );

      const data = await response.json();

      if (data.classification) {
        setGradingResult(data);
      } else {
        setError("Something went wrong grading your answer.");
      }
    } catch (err) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Runs the RevenueCat purchase flow for the premium package.
  // Returns true if the user now has the entitlement, false otherwise.
  const purchasePremium = async () => {
    setPurchasing(true);
    setError(null);

    try {
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find(
        (p) => p.identifier === PREMIUM_PACKAGE_ID
      );

      if (!pkg) {
        setError(
          "Could not find the premium package. Check your RevenueCat offering setup."
        );
        return false;
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);
      const isPremium =
        typeof customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID] !==
        "undefined";
      setHasPremium(isPremium);
      return isPremium;
    } catch (err) {
      // RevenueCat flags user-initiated cancellations distinctly from real errors
      if (!err.userCancelled) {
        setError(err.message);
      }
      return false;
    } finally {
      setPurchasing(false);
    }
  };

  // Called when the user taps the follow-up button. Gates access behind
  // the premium entitlement, running the purchase flow first if needed.
  const handleFollowUpPress = async () => {
    const proceed = () => {
      setQuestion(gradingResult.followUpQuestion);
      setAskedQuestions((prev) => [...prev, gradingResult.followUpQuestion]);
      setAnswer("");
      setGradingResult(null);
    };

    if (hasPremium) {
      proceed();
      return;
    }

    const unlocked = await purchasePremium();
    if (unlocked) proceed();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Study Diagnosis</Text>

        {/* TEMPORARY DEBUG: confirms RevenueCat is connected and reading status correctly */}
        <Text style={styles.fileName}>
          Premium status: {hasPremium ? "Unlocked" : "Locked"}
        </Text>

        <Button title="Pick a PDF" onPress={pickPdf} />

        {selectedFile && (
          <Text style={styles.fileName}>Selected: {selectedFile.name}</Text>
        )}

        {selectedFile && (
          <View style={styles.buttonSpacing}>
            <Button title="Generate Question" onPress={generateQuestion} />
          </View>
        )}

        {(loading || purchasing) && (
          <ActivityIndicator style={styles.buttonSpacing} />
        )}

        {question && (
          <>
            <Text style={styles.question}>{question}</Text>

            <TextInput
              style={styles.input}
              multiline
              placeholder="Type your answer here..."
              value={answer}
              onChangeText={setAnswer}
            />

            <View style={styles.buttonSpacing}>
              <Button title="Submit Answer" onPress={gradeAnswer} />
            </View>
          </>
        )}

        {gradingResult && (
          <View style={styles.resultBox}>
            <Text style={styles.classification}>
              {gradingResult.classification}
            </Text>
            <Text style={styles.resultLabel}>What you showed:</Text>
            <Text style={styles.resultText}>
              {gradingResult.demonstrated}
            </Text>
            {gradingResult.gap && (
              <>
                <Text style={styles.resultLabel}>Gap to work on:</Text>
                <Text style={styles.resultText}>{gradingResult.gap}</Text>
              </>
            )}

            {gradingResult.followUpQuestion && (
              <View style={styles.buttonSpacing}>
                <Button
                  title={
                    hasPremium
                      ? "Try a Follow-Up Question"
                      : "Unlock Follow-Up Question"
                  }
                  onPress={handleFollowUpPress}
                />
              </View>
            )}
          </View>
        )}

        {error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
  },
  fileName: {
    marginTop: 20,
    fontSize: 16,
  },
  buttonSpacing: {
    marginTop: 20,
  },
  question: {
    marginTop: 20,
    fontSize: 18,
    fontStyle: "italic",
    textAlign: "center",
  },
  input: {
    marginTop: 20,
    width: "100%",
    minHeight: 100,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 10,
    textAlignVertical: "top",
  },
  resultBox: {
    marginTop: 20,
    width: "100%",
    padding: 15,
    borderRadius: 8,
    backgroundColor: "#f2f2f2",
  },
  classification: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 10,
  },
  resultLabel: {
    fontWeight: "bold",
    marginTop: 10,
  },
  resultText: {
    marginTop: 4,
  },
  error: {
    marginTop: 20,
    color: "red",
    textAlign: "center",
  },
});