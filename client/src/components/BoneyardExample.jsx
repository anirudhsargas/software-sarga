import { Skeleton } from 'boneyard-js/react';

/**
 * Example component demonstrating boneyard skeleton loading framework
 * Usage: Wrap your component with <Skeleton name="unique-name" loading={isLoading}>
 * 
 * The skeleton will be auto-generated based on your component's structure
 * when you run the dev server with the boneyard plugin enabled.
 * 
 * To generate bones:
 * 1. Start dev server: npm run dev
 * 2. Navigate to the component in your browser
 * 3. The boneyard plugin will automatically capture the component's structure
 * 4. Bones are saved to ./bones/registry
 */
export const BoneyardExample = ({ data, isLoading }) => {
  return (
    <Skeleton name="example-card" loading={isLoading}>
      {data && (
        <div className="example-card">
          <h2>{data.title}</h2>
          <p>{data.description}</p>
        </div>
      )}
    </Skeleton>
  );
};

export default BoneyardExample;
