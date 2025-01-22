import { Chunkr } from "../Chunkr";
import { Status, SegmentType } from "../models/TaskResponseData";
import { describe, it, expect, beforeAll } from "@jest/globals";
import * as path from "path";
import {
  SegmentationStrategy,
  OcrStrategy,
  SegmentProcessing,
  GenerationStrategy,
} from "../models/Configuration";

describe("Chunkr Basic Functionality", () => {
  let chunkr: Chunkr;
  let uploadedTaskId: string;
  const TEST_FILES_DIR = path.join(__dirname, "input");

  beforeAll(() => {
    chunkr = new Chunkr();
    if (!process.env.CHUNKR_API_KEY) {
      throw new Error("CHUNKR_API_KEY not found in environment");
    }

    // Check if input directory exists
    if (!require("fs").existsSync(TEST_FILES_DIR)) {
      throw new Error(`Input directory not found at: ${TEST_FILES_DIR}`);
    }

    // Check if directory contains any files
    const files = require("fs").readdirSync(TEST_FILES_DIR);
    if (files.length === 0) {
      throw new Error(`No files found in input directory: ${TEST_FILES_DIR}`);
    }
  });

  it("should successfully upload and process a single file", async () => {
    // Get all files from the input directory
    const files = require("fs").readdirSync(TEST_FILES_DIR);
    if (files.length === 0) {
      throw new Error("No files found in input directory");
    }

    // Pick a random file from the directory
    const randomFile = files[Math.floor(Math.random() * files.length)];
    const testFilePath = path.join(TEST_FILES_DIR, randomFile);

    try {
      // Upload the file and wait for processing to complete
      const result = await chunkr.upload(testFilePath);

      // Store the task ID for the next test
      uploadedTaskId = result.task_id;

      if (result.status === Status.SUCCEEDED) {
        console.log("File processed successfully:", {
          taskId: result.task_id,
          fileName: result.file_name,
          status: result.status,
          pageCount: result.page_count,
        });
      } else {
        console.error("File processing failed:", {
          taskId: result.task_id,
          fileName: result.file_name,
          status: result.status,
          error: result.error,
        });
        expect(result.status).toBe(Status.SUCCEEDED);
      }

      expect(result.status).toBe(Status.SUCCEEDED);
      expect(result.page_count).toBeGreaterThan(0);
      expect(result.output?.chunks.length).toBeGreaterThan(0);
    } catch (error) {
      console.error("Test failed:", error);
      throw error;
    }
  });

  it("should successfully update a file", async () => {
    // Update the task with new configuration
    const updateResult = await chunkr.updateTask(uploadedTaskId, {
      high_resolution: true,
    });

    // Wait for the update to complete and task to finish processing
    let taskStatus = await chunkr.getTask(uploadedTaskId);
    while (taskStatus.status !== Status.SUCCEEDED) {
      if (taskStatus.status === Status.FAILED) {
        throw new Error(`Task failed: ${taskStatus.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      taskStatus = await chunkr.getTask(uploadedTaskId);
    }

    // Verify the update was successful
    expect(taskStatus.status).toBe(Status.SUCCEEDED);
    expect(taskStatus.task_id).toBe(uploadedTaskId);
    expect(taskStatus.output?.chunks.length).toBeGreaterThan(0);
  });

  it("should successfully delete a file", async () => {
    try {
      // Double check task is in SUCCEEDED state before deletion
      const taskStatus = await chunkr.getTask(uploadedTaskId);
      if (taskStatus.status !== Status.SUCCEEDED) {
        throw new Error(
          `Task is not ready for deletion. Current status: ${taskStatus.status}`,
        );
      }

      await chunkr.deleteTask(uploadedTaskId);
    } catch (error) {
      console.error("Delete task failed:", error);
      throw error;
    }
  });
});

describe("Chunkr Advanced Functionality", () => {
  let chunkr: Chunkr;
  const TEST_FILES_DIR = path.join(__dirname, "test_input");

  beforeAll(() => {
    chunkr = new Chunkr();
    if (!process.env.CHUNKR_API_KEY) {
      throw new Error("CHUNKR_API_KEY not found in environment");
    }

    // Check if test_input directory exists
    if (!require("fs").existsSync(TEST_FILES_DIR)) {
      throw new Error(`Test input directory not found at: ${TEST_FILES_DIR}`);
    }

    // Check if directory contains any files
    const files = require("fs").readdirSync(TEST_FILES_DIR);
    if (files.length === 0) {
      throw new Error(
        `No files found in test input directory: ${TEST_FILES_DIR}`,
      );
    }
  });

  it("should process files with different segmentation strategies", async () => {
    // Get a test file
    const files = require("fs").readdirSync(TEST_FILES_DIR);
    const testFilePath = path.join(TEST_FILES_DIR, files[0]);

    const strategies = [
      SegmentationStrategy.LAYOUT_ANALYSIS,
      SegmentationStrategy.PAGE,
    ];

    console.log("\nSegmentation Strategy Test Results:");
    console.log("=================================");

    for (const strategy of strategies) {
      try {
        const result = await chunkr.upload(testFilePath, {
          segmentation_strategy: strategy,
        });

        // Create a formatted test result output
        const testResult = {
          Strategy: strategy,
          "Task ID": result.task_id,
          "File Name": result.file_name,
          Status: result.status,
          "Page Count": result.page_count,
          "Chunk Count": result.output?.chunks.length,
        };

        // Log the results in a structured format
        console.log(`\n${strategy} Strategy Results:`);
        console.table(testResult);

        // Basic validations
        expect(result.status).toBe(Status.SUCCEEDED);
        expect(result.output?.chunks.length).toBeGreaterThan(0);

        // Clean up
        await chunkr.deleteTask(result.task_id);
      } catch (error) {
        console.error(`Failed for strategy: ${strategy}`, error);
        throw error;
      }
    }
  });

  it("should process files with different OCR strategies", async () => {
    // Get a test file
    const files = require("fs").readdirSync(TEST_FILES_DIR);
    const testFilePath = path.join(TEST_FILES_DIR, files[0]);

    const strategies = [OcrStrategy.AUTO, OcrStrategy.ALL];

    console.log("\nOCR Strategy Test Results:");
    console.log("==========================");

    for (const strategy of strategies) {
      try {
        const result = await chunkr.upload(testFilePath, {
          ocr_strategy: strategy,
        });

        // Count segments with OCR results
        const segmentsWithOcr =
          result.output?.chunks.reduce((count, chunk) => {
            return (
              count +
              chunk.segments.filter(
                (segment) => segment.ocr && segment.ocr.length > 0,
              ).length
            );
          }, 0) || 0;

        // Check if OCR results have valid bounding boxes
        const hasValidBoundingBoxes = result.output?.chunks.every((chunk) =>
          chunk.segments.every((segment) =>
            segment.ocr?.every(
              (ocr) =>
                ocr.bbox &&
                typeof ocr.bbox.left === "number" &&
                typeof ocr.bbox.top === "number" &&
                typeof ocr.bbox.width === "number" &&
                typeof ocr.bbox.height === "number",
            ),
          ),
        );

        // Create a formatted test result output
        const testResult = {
          Strategy: strategy,
          "Task ID": result.task_id,
          Status: result.status,
          "Segments with OCR": segmentsWithOcr,
          "Valid Bounding Boxes": hasValidBoundingBoxes ? "Yes" : "No",
          "OCR Confidence":
            (result.output?.chunks
              ?.flatMap((c) => c.segments)
              ?.flatMap((s) => s.ocr || [])
              ?.filter((o) => o.confidence !== null)
              ?.map((o) => o.confidence)?.length ?? 0) > 0
              ? "Present"
              : "None",
        };

        // Log the results in a structured format
        console.log(`\n${strategy} Strategy Results:`);
        console.table(testResult);

        // Basic validations
        expect(result.status).toBe(Status.SUCCEEDED);

        // Strategy-specific validations
        if (strategy === OcrStrategy.ALL) {
          // ALL strategy should have OCR results for segments
          expect(segmentsWithOcr).toBeGreaterThan(0);
          expect(hasValidBoundingBoxes).toBe(true);
        }

        // Clean up
        await chunkr.deleteTask(result.task_id);
      } catch (error) {
        console.error(`Failed for OCR strategy: ${strategy}`, error);
        throw error;
      }
    }
  });

  it("should process all segment types with LLM generation", async () => {
    const testFilePath = path.join(TEST_FILES_DIR, "test.pdf");
    if (!require("fs").existsSync(testFilePath)) {
      throw new Error(`Test file not found at: ${testFilePath}`);
    }

    // Create segment processing config for all segment types
    const segmentProcessing: SegmentProcessing = {
      title: { html: GenerationStrategy.LLM, markdown: GenerationStrategy.LLM },
      section_header: {
        html: GenerationStrategy.LLM,
        markdown: GenerationStrategy.LLM,
      },
      text: { html: GenerationStrategy.LLM, markdown: GenerationStrategy.LLM },
      list_item: {
        html: GenerationStrategy.LLM,
        markdown: GenerationStrategy.LLM,
      },
      table: { html: GenerationStrategy.LLM, markdown: GenerationStrategy.LLM },
      picture: {
        html: GenerationStrategy.LLM,
        markdown: GenerationStrategy.LLM,
      },
      caption: {
        html: GenerationStrategy.LLM,
        markdown: GenerationStrategy.LLM,
      },
      formula: {
        html: GenerationStrategy.LLM,
        markdown: GenerationStrategy.LLM,
      },
      footnote: {
        html: GenerationStrategy.LLM,
        markdown: GenerationStrategy.LLM,
      },
      page_header: {
        html: GenerationStrategy.LLM,
        markdown: GenerationStrategy.LLM,
      },
      page_footer: {
        html: GenerationStrategy.LLM,
        markdown: GenerationStrategy.LLM,
      },
    };

    try {
      const result = await chunkr.upload(testFilePath, {
        segment_processing: segmentProcessing,
        segmentation_strategy: SegmentationStrategy.LAYOUT_ANALYSIS,
      });

      await result.poll();

      // Check all segments have both HTML and Markdown
      const allSegments =
        result.output?.chunks.flatMap((chunk) => chunk.segments) || [];

      console.log("\nSegment Processing Results:");
      console.log({
        totalSegments: allSegments.length,
        withHtml: allSegments.filter((s) => s.html?.trim()).length,
        withMarkdown: allSegments.filter((s) => s.markdown?.trim()).length,
      });

      expect(allSegments.length).toBeGreaterThan(0);
      expect(allSegments.every((s) => s.html?.trim())).toBe(true);
      expect(allSegments.every((s) => s.markdown?.trim())).toBe(true);

      await chunkr.deleteTask(result.task_id);
    } catch (error) {
      console.error("LLM generation test failed:", error);
      throw error;
    }
  });

  it("should process Page segments with LLM generation", async () => {
    const testFilePath = path.join(TEST_FILES_DIR, "test.pdf");
    if (!require("fs").existsSync(testFilePath)) {
      throw new Error(`Test file not found at: ${testFilePath}`);
    }

    const segmentProcessing: SegmentProcessing = {
      page: { html: GenerationStrategy.LLM, markdown: GenerationStrategy.LLM },
    };

    try {
      const result = await chunkr.upload(testFilePath, {
        segment_processing: segmentProcessing,
        segmentation_strategy: SegmentationStrategy.PAGE,
      });

      await result.poll();

      const pageSegments =
        result.output?.chunks.flatMap((chunk) =>
          chunk.segments.filter(
            (segment) => segment.segment_type === SegmentType.Page,
          ),
        ) || [];

      console.log("\nPage Segment Processing Results:");
      console.log({
        totalPageSegments: pageSegments.length,
        withHtml: pageSegments.filter((s) => s.html?.trim()).length,
        withMarkdown: pageSegments.filter((s) => s.markdown?.trim()).length,
      });

      expect(pageSegments.length).toBeGreaterThan(0);
      expect(pageSegments.every((s) => s.html?.trim())).toBe(true);
      expect(pageSegments.every((s) => s.markdown?.trim())).toBe(true);

      await chunkr.deleteTask(result.task_id);
    } catch (error) {
      console.error("Page LLM generation test failed:", error);
      throw error;
    }
  });

  it("should process all segment types with AUTO generation", async () => {
    const testFilePath = path.join(TEST_FILES_DIR, "test.pdf");
    if (!require("fs").existsSync(testFilePath)) {
      throw new Error(`Test file not found at: ${testFilePath}`);
    }

    // Create segment processing config for all segment types with AUTO
    const segmentProcessing: SegmentProcessing = {
      title: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
      section_header: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
      text: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
      list_item: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
      table: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
      picture: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
      caption: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
      formula: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
      footnote: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
      page_header: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
      page_footer: {
        html: GenerationStrategy.AUTO,
        markdown: GenerationStrategy.AUTO,
      },
    };

    try {
      const result = await chunkr.upload(testFilePath, {
        segment_processing: segmentProcessing,
        segmentation_strategy: SegmentationStrategy.LAYOUT_ANALYSIS,
      });

      await result.poll();

      // Check all segments have both HTML and Markdown
      const allSegments =
        result.output?.chunks.flatMap((chunk) => chunk.segments) || [];

      console.log("\nAUTO Segment Processing Results:");
      console.log({
        totalSegments: allSegments.length,
        withHtml: allSegments.filter((s) => s.html?.trim()).length,
        withMarkdown: allSegments.filter((s) => s.markdown?.trim()).length,
      });

      expect(allSegments.length).toBeGreaterThan(0);
      expect(allSegments.every((s) => s.html?.trim())).toBe(true);
      expect(allSegments.every((s) => s.markdown?.trim())).toBe(true);

      await chunkr.deleteTask(result.task_id);
    } catch (error) {
      console.error("AUTO generation test failed:", error);
      throw error;
    }
  });
});

describe("Chunkr Input Handling", () => {
  let chunkr: Chunkr;
  const TEST_FILES_DIR = path.join(__dirname, "test_input");
  const SAMPLE_URL =
    "https://www.adobe.com/support/products/enterprise/knowledgecenter/media/c4611_sample_explain.pdf";

  beforeAll(() => {
    chunkr = new Chunkr();
    if (!process.env.CHUNKR_API_KEY) {
      throw new Error("CHUNKR_API_KEY not found in environment");
    }
  });

  it("should handle input files with different formats", async () => {
    const testCases = [
      {
        name: "Local PDF file",
        input: path.join(TEST_FILES_DIR, "test.pdf"),
        type: "file-path",
      },
      {
        name: "Remote PDF URL",
        input: SAMPLE_URL,
        type: "url",
      },
      {
        name: "Buffer input",
        input: Buffer.from("Mock PDF content"),
        type: "buffer",
      },
      {
        name: "Base64 PDF",
        input:
          "data:application/pdf;base64,JVBERi0xLjcKCjEgMCBvYmogICUgZW50cnkgcG9pbnQKPDwKICAvVHlwZSAvQ2F0YWxvZwogIC9QYWdlcyAyIDAgUgo+PgplbmRvYmoKCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAvTWVkaWFCb3ggWyAwIDAgMjAwIDIwMCBdCiAgL0NvdW50IDEKICAvS2lkcyBbIDMgMCBSIF0KPj4KZW5kb2JqCgozIDAgb2JqCjw8CiAgL1R5cGUgL1BhZ2UKICAvUGFyZW50IDIgMCBSCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSIAogICAgPj4KICA+PgogIC9Db250ZW50cyA1IDAgUgo+PgplbmRvYmoKCjQgMCBvYmoKPDwKICAvVHlwZSAvRm9udAogIC9TdWJ0eXBlIC9UeXBlMQogIC9CYXNlRm9udCAvVGltZXMtUm9tYW4KPj4KZW5kb2JqCgo1IDAgb2JqICAlIHBhZ2UgY29udGVudAo8PAogIC9MZW5ndGggNDQKPj4Kc3RyZWFtCkJUCjcwIDUwIFRECi9GMSAxMiBUZgooSGVsbG8sIHdvcmxkISkgVGoKRVQKZW5kc3RyZWFtCmVuZG9iagoKeHJlZgowIDYKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDEwIDAwMDAwIG4gCjAwMDAwMDAwNzkgMDAwMDAgbiAKMDAwMDAwMDE3MyAwMDAwMCBuIAowMDAwMDAwMzAxIDAwMDAwIG4gCjAwMDAwMDAzODAgMDAwMDAgbiAKdHJhaWxlcgo8PAogIC9TaXplIDYKICAvUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKNDkyCiUlRU9G",
        type: "base64",
      },
    ];

    for (const testCase of testCases) {
      try {
        console.log(`Testing ${testCase.name}...`);
        const result = await chunkr.upload(testCase.input);

        // Basic validations
        expect(result.status).toBe(Status.SUCCEEDED);
        expect(result.task_id).toBeTruthy();
        expect(result.output?.chunks.length).toBeGreaterThan(0);

        // Clean up
        await chunkr.deleteTask(result.task_id);
        console.log(`✓ ${testCase.name} test passed`);
      } catch (error) {
        console.error(`Failed for ${testCase.name}:`, error);
        throw error;
      }
    }
  });

  it("should handle file streams", async () => {
    const testFilePath = path.join(TEST_FILES_DIR, "test.pdf");
    const fileStream = require("fs").createReadStream(testFilePath);

    try {
      const result = await chunkr.upload(fileStream);

      expect(result.status).toBe(Status.SUCCEEDED);
      expect(result.task_id).toBeTruthy();
      expect(result.output?.chunks.length).toBeGreaterThan(0);

      await chunkr.deleteTask(result.task_id);
    } catch (error) {
      console.error("Stream test failed:", error);
      throw error;
    }
  });

  it("should handle configuration options with file upload", async () => {
    const testFilePath = path.join(TEST_FILES_DIR, "test.pdf");
    const config = {
      high_resolution: true,
      segmentation_strategy: SegmentationStrategy.LAYOUT_ANALYSIS,
      ocr_strategy: OcrStrategy.AUTO,
    };

    try {
      const result = await chunkr.upload(testFilePath, config);

      expect(result.status).toBe(Status.SUCCEEDED);
      expect(result.task_id).toBeTruthy();
      expect(result.output?.chunks.length).toBeGreaterThan(0);

      await chunkr.deleteTask(result.task_id);
    } catch (error) {
      console.error("Configuration test failed:", error);
      throw error;
    }
  });

  it("should handle errors for invalid inputs", async () => {
    const invalidCases = [
      {
        name: "Non-existent file",
        input: "nonexistent.pdf",
        expectedError: "File not found",
      },
      {
        name: "Invalid URL",
        input: "https://invalid-url-that-does-not-exist.pdf",
        expectedError: "HTTP error",
      },
      {
        name: "Invalid base64",
        input: "data:application/pdf;base64,invalid-base64-content",
        expectedError: "Invalid base64",
      },
    ];

    for (const testCase of invalidCases) {
      try {
        await chunkr.upload(testCase.input);
        expect(true).toBe(false); // This will always fail the test
      } catch (error) {
        // Type guard to check if error is an Error object
        if (error instanceof Error) {
          expect(error.message).toContain(testCase.expectedError);
          console.log(`✓ ${testCase.name} correctly handled error`);
        } else {
          // Handle case where error is not an Error object
          expect(true).toBe(false); // Fail test if error is not an Error object
        }
      }
    }
  });
});
