const int PULSE_PIN  = 23;  // Coin acceptor pulse input
const int ENABLE_PIN = 22;  // Active-HIGH enable input

// --------------------------------------------------
// TIMING SETTINGS
// --------------------------------------------------

const unsigned long debounceDelay = 80;
const unsigned long pulseTimeout  = 500;
const unsigned long enableDelay   = 2000;
const unsigned long disableDelay  = 500;

// --------------------------------------------------
// VARIABLES
// --------------------------------------------------

volatile int pulseCount = 0;
volatile unsigned long lastPulseTime = 0;
volatile bool processingCoin = false;
volatile bool countingEnabled = false;

unsigned long enableHighStart = 0;
unsigned long enableLowStart = 0;

bool previousEnableState = false;

int runningTotalCredit = 0;

// --------------------------------------------------
// INTERRUPT: COUNT FALLING EDGES
// --------------------------------------------------

void IRAM_ATTR handlePulse()
{
    if (!countingEnabled)
        return;

    unsigned long now = millis();

    if (now - lastPulseTime < debounceDelay)
        return;

    pulseCount++;
    lastPulseTime = now;
    processingCoin = true;
}

// --------------------------------------------------
// RESET PULSE SEQUENCE
// --------------------------------------------------

void resetCoinSequence()
{
    noInterrupts();

    pulseCount = 0;
    processingCoin = false;
    lastPulseTime = millis();

    interrupts();
}

// --------------------------------------------------
// SETUP
// --------------------------------------------------

void setup()
{
    Serial.begin(115200);

    // GPIO 22 must be driven to a defined HIGH or LOW level.
    pinMode(ENABLE_PIN, INPUT);

    // Coin acceptor output: idle HIGH, pulse LOW.
    pinMode(PULSE_PIN, INPUT_PULLUP);

    resetCoinSequence();

    attachInterrupt(
        digitalPinToInterrupt(PULSE_PIN),
        handlePulse,
        FALLING
    );

    Serial.println();
    Serial.println("================================");
    Serial.println("ESP32 COIN ACCEPTOR");
    Serial.println("================================");
    Serial.println("GPIO 22: Enable control");
    Serial.println("GPIO 23: Coin pulse input");
    Serial.println("ON delay:  2000 ms");
    Serial.println("OFF delay: 500 ms");
    Serial.println("Waiting for enable signal...");
}

// --------------------------------------------------
// LOOP
// --------------------------------------------------

void loop()
{
    unsigned long now = millis();

    bool enableState =
        (digitalRead(ENABLE_PIN) == HIGH);

    // ==============================================
    // GPIO 22 LOW: START OFF TIMER
    // ==============================================

    if (!enableState)
    {
        // Start timer on first LOW observation.
        if (enableLowStart == 0)
        {
            enableLowStart = now;

            Serial.println(
                "GPIO 22 LOW: Starting 500ms OFF timer..."
            );
        }

        // Disable only after continuous LOW for 500ms.
        if (countingEnabled &&
            now - enableLowStart >= disableDelay)
        {
            countingEnabled = false;

            resetCoinSequence();

            Serial.println(
                "DISABLED: GPIO 22 LOW for 500ms"
            );
            Serial.println(
                "Incomplete coin sequence discarded."
            );
        }

        // If the system was waiting to enable,
        // cancel the 2-second HIGH timer.
        if (!countingEnabled)
        {
            enableHighStart = 0;
        }

        previousEnableState = false;

        // Process no coins while the input is LOW.
        delay(1);
        return;
    }

    // ==============================================
    // GPIO 22 HIGH: CANCEL OFF TIMER
    // ==============================================

    enableLowStart = 0;

    // Start the ON timer whenever HIGH returns
    // after the system was previously observing LOW.
    if (!previousEnableState)
    {
        enableHighStart = now;
        previousEnableState = true;

        Serial.println("GPIO 22 HIGH");
        Serial.println(
            "Waiting 2 seconds for stable HIGH..."
        );
    }

    // ==============================================
    // REQUIRE 2 SECONDS OF CONTINUOUS HIGH
    // ==============================================

    if (!countingEnabled)
    {
        if (enableHighStart != 0 &&
            now - enableHighStart >= enableDelay)
        {
            resetCoinSequence();

            countingEnabled = true;

            Serial.println(
                "ENABLED: HIGH stable for 2 seconds"
            );
            Serial.println("Ready to count coins.");
        }

        delay(1);
        return;
    }

    // ==============================================
    // PROCESS COMPLETED COIN SEQUENCE
    // ==============================================

    if (processingCoin &&
        now - lastPulseTime >= pulseTimeout)
    {
        // Check whether GPIO 22 is still HIGH.
        if (digitalRead(ENABLE_PIN) != HIGH)
            return;

        // Atomically capture and clear pulse count.
        noInterrupts();

        int pulses = pulseCount;
        pulseCount = 0;
        processingCoin = false;

        interrupts();

        Serial.print("Detected Pulses: ");
        Serial.println(pulses);

        // ==========================================
        // COIN VALUE MAPPING
        // ==========================================

        int coinValue = 0;

        // ₱1: 1-2 pulses
        if (pulses >= 1 && pulses <= 2)
        {
            coinValue = 1;
        }
        // ₱5: 5-7 pulses
        else if (pulses >= 5 && pulses <= 7)
        {
            coinValue = 5;
        }
        // ₱10: 10-13 pulses
        else if (pulses >= 10 && pulses <= 13)
        {
            coinValue = 10;
        }
        // ₱20: 20-21 pulses
        else if (pulses >= 20 && pulses <= 21)
        {
            coinValue = 20;
        }
        else
        {
            Serial.print("INVALID: ");
            Serial.print(pulses);
            Serial.println(" pulses");
        }

        // ==========================================
        // ADD CREDIT
        // ==========================================

        if (coinValue > 0 &&
            countingEnabled &&
            digitalRead(ENABLE_PIN) == HIGH)
        {
            runningTotalCredit += coinValue;

            Serial.print("Coin Validated: P");
            Serial.print(coinValue);
            Serial.print(".00 | Total Balance: P");
            Serial.println(runningTotalCredit);

            Serial.println("---------------------------");
        }
    }
}