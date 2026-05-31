pub mod cli;
pub mod cluster;
pub mod collector;
pub mod config;
pub mod output;
pub mod rules;
pub mod scheduler;

use anyhow::Result;
use clap::Parser;
use cli::Cli;

#[tokio::main]
async fn main() -> Result<()> {
    let cli = Cli::parse();
    cli.run().await
}
