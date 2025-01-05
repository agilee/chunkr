use config::{Config as ConfigTrait, ConfigError};
use dotenvy::dotenv_override;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use strum_macros::Display;

#[derive(Debug, Serialize, Deserialize, Display)]
#[serde(rename_all = "snake_case")]
pub enum ImageField {
    #[serde(rename = "image")]
    Image,
    #[serde(rename = "image_url")]
    ImageUrl,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Config {
    #[serde(default = "default_image_field")]
    pub image_field: ImageField,
    #[serde(default = "default_key")]
    pub key: String,
    #[serde(default = "default_model")]
    pub model: String,
    pub ocr_key: Option<String>,
    pub ocr_model: Option<String>,
    pub ocr_url: Option<String>,
    pub structured_extraction_key: Option<String>,
    pub structured_extraction_model: Option<String>,
    pub structured_extraction_url: Option<String>,
    #[serde(default = "default_url")]
    pub url: String,
}

fn default_image_field() -> ImageField {
    ImageField::ImageUrl
}

fn default_key() -> String {
    "".to_string()
}

fn default_model() -> String {
    "gpt-4o".to_string()
}

fn default_url() -> String {
    "https://api.openai.com/v1/chat/completions".to_string()
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        dotenv_override().ok();
        ConfigTrait::builder()
            .add_source(config::Environment::default().prefix("LLM").separator("__"))
            .build()?
            .try_deserialize::<Self>()
    }
}

fn get_template(prompt_name: &str) -> Result<String, std::io::Error> {
    let content = match prompt_name {
        "formula" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/formula.txt"
        )),
        "html_caption" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_caption.txt"
        )),
        "html_footnote" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_footnote.txt"
        )),
        "html_list_item" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_list_item.txt"
        )),
        "html_page_footer" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_page_footer.txt"
        )),
        "html_page_header" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_page_header.txt"
        )),
        "html_page" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_page.txt"
        )),
        "html_picture" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_picture.txt"
        )),
        "html_section_header" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_section_header.txt"
        )),
        "html_table" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_table.txt"
        )),
        "html_text" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_text.txt"
        )),
        "html_title" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/html_title.txt"
        )),
        "md_caption" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_caption.txt"
        )),
        "md_footnote" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_footnote.txt"
        )),
        "md_list_item" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_list_item.txt"
        )),
        "md_page_footer" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_page_footer.txt"
        )),
        "md_page_header" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_page_header.txt"
        )),
        "md_page" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_page.txt"
        )),
        "md_picture" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_picture.txt"
        )),
        "md_section_header" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_section_header.txt"
        )),
        "md_table" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_table.txt"
        )),
        "md_text" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_text.txt"
        )),
        "md_title" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/md_title.txt"
        )),
        "structured_extraction" => include_str!(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/src/utils/prompts/structured_extraction.txt"
        )),
        _ => {
            return Err(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("Prompt '{}' not found", prompt_name),
            ))
        }
    };
    Ok(content.to_string())
}

fn fill_prompt(template: &str, values: &std::collections::HashMap<String, String>) -> String {
    let mut result = template.to_string();

    result = result.replace("\\{", r"\u005c\u007b");
    result = result.replace("\\}", r"\u005c\u007d");

    for (key, value) in values {
        result = result.replace(&format!("{{{}}}", key), value);
    }
    result = result.replace(r"\u005c\u007b", "{");
    result = result.replace(r"\u005c\u007d", "}");

    result
}

pub fn get_prompt(
    prompt_name: &str,
    values: &HashMap<String, String>,
) -> Result<String, std::io::Error> {
    let template = get_template(prompt_name)?;
    let filled_prompt = fill_prompt(&template, values);
    Ok(filled_prompt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    #[tokio::test]
    async fn test_get_template() -> Result<(), std::io::Error> {
        let prompt = get_template("structured_extraction").unwrap();
        println!("Prompt: {}", prompt);
        Ok(())
    }

    #[tokio::test]
    async fn test_fill_prompt_with_values() -> Result<(), std::io::Error> {
        let mut values = HashMap::new();
        values.insert("name".to_string(), "Invoice Number".to_string());
        values.insert(
            "description".to_string(),
            "The unique identifier for this invoice".to_string(),
        );
        values.insert("field_type".to_string(), "string".to_string());
        values.insert("context".to_string(), "Invoice #12345...".to_string());
        let filled_prompt = get_prompt("structured_extraction", &values)?;
        println!("{}", filled_prompt);
        Ok(())
    }

    #[tokio::test]
    async fn test_fill_prompt_with_values_table() -> Result<(), std::io::Error> {
        let filled_prompt = get_prompt("table", &HashMap::new())?;
        println!("{}", filled_prompt);
        Ok(())
    }
}
