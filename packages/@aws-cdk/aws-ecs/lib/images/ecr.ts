import ecr = require('@aws-cdk/aws-ecr');
import { Construct } from '@aws-cdk/core';
import { ContainerDefinition } from '../container-definition';
import { ContainerImage, ContainerImageConfig } from '../container-image';

/**
 * An image from an ECR repository
 */
export class EcrImage extends ContainerImage {
  public readonly imageName: string;

  /**
   * Constructs a new instance of the EcrImage class.
   */
  constructor(private readonly repository: ecr.IRepository, private readonly tag: string) {
    super();
  }

  public bind(_scope: Construct, containerDefinition: ContainerDefinition): ContainerImageConfig {
    this.repository.grantPull(containerDefinition.taskDefinition.obtainExecutionRole());

    return {
      imageName: this.repository.repositoryUriForTag(this.tag)
    };
  }
}
