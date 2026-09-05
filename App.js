import { useState } from "react";
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

// TODO: replace with your actual Supabase project URL and anon key
const SUPABASE_URL = "https://uxnldchxaeflihowpxkl.supabase.co";
const ANON_KEY = "sb_publishable_WeFoU284NoH4i_fIcOxnTg_stZVRxpj";

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
  const [answer, setAnswer] = useState("");
  const [gradingResult, setGradingResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const pickPdf = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });

    if (result.canceled) {
      return;
    }

    setSelectedFile(result.assets[0]);
    setQuestion(null);
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
          body: JSON.stringify({ pdfBase64: base64 }),
        }
      );

      const data = await response.json();

      if (data.question) {
        setQuestion(data.question);
      } else {
        setError("Something went wrong generating the question.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const gradeAnswer = async () => {
    if (!selectedFile || !question || !answer.trim()) return;

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
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Study Diagnosis</Text>

        <Button title="Pick a PDF" onPress={pickPdf} />

        {selectedFile && (
          <Text style={styles.fileName}>Selected: {selectedFile.name}</Text>
        )}

        {selectedFile && (
          <View style={styles.buttonSpacing}>
            <Button title="Generate Question" onPress={generateQuestion} />
          </View>
        )}

        {loading && <ActivityIndicator style={styles.buttonSpacing} />}

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
